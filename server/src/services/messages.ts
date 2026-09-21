import { z } from "zod";
import { env } from "../env";
import { db, must } from "../lib/db";
import { fail } from "../lib/errors";
import { sha256, token } from "../lib/crypto";
import { log } from "../lib/log";
import type { Actor } from "../lib/auth";
import { assertCanSend, recordSends } from "../lib/plan";
import { providerFor, ProviderError, type OutboundEmail } from "../providers";
import { cleanHtml, extractLinks, htmlToText, mergeVars, personalize, unsubscribeUrl } from "./compose";
import { recordEvent } from "./events";
import { enqueue, registerJob, RetryLater } from "./jobs";

const email = z.string().trim().toLowerCase().email().max(254);
const addr = z.union([email.transform((e) => ({ email: e, name: null as string | null })), z.object({ email, name: z.string().max(120).nullish() })]);

export const MessageInput = z.object({
  to: z.array(addr).min(1).max(50),
  cc: z.array(addr).max(50).default([]),
  bcc: z.array(addr).max(50).default([]),
  subject: z.string().max(998).default(""),
  html: z.string().max(500_000).default(""),
  text: z.string().max(500_000).optional(),
  reply_to: email.nullish(),
  sender_identity_id: z.string().uuid().nullish(),
  template_id: z.string().uuid().nullish(),
  variables: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string().max(50)).max(20).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  correlation_id: z.string().max(200).nullish(),
  tracking: z.object({ open: z.boolean().default(true), click: z.boolean().default(true), files: z.boolean().default(true) }).partial().default({}),
  delivery_mode: z.enum(["individual", "group"]).default("individual"),
  file_ids: z.array(z.string().uuid()).max(10).default([]),
  file_expires_at: z.string().datetime({ offset: true }).nullish(),
  unsubscribe_link: z.boolean().optional(),
  scheduled_at: z.string().datetime({ offset: true }).nullish(),
  send: z.boolean().default(false),
  source: z.enum(["web", "api", "extension"]).optional(),
});
export type MessageInput = z.infer<typeof MessageInput>;

async function resolveSender(orgId: string, identityId: string | null | undefined, actor: Actor) {
  const org = must(await db.from("organizations").select("name, default_sender_id, default_reply_to, tracking_defaults, consent_language, require_tracking_notice").eq("id", orgId).single(), "org") as any;
  const id = identityId ?? org.default_sender_id;
  if (id) {
    const ident = must(await db.from("sender_identities").select("*, sender_domains(status), provider_connections(status, user_id)").eq("id", id).eq("org_id", orgId).maybeSingle(), "sender") as any;
    if (!ident) fail("bad_request", "Sender identity not found in this workspace");
    if (ident.kind === "managed" && ident.sender_domains?.status !== "verified") fail("bad_request", `The domain for ${ident.email} is not verified yet. Finish DNS verification before sending from it.`);
    if ((ident.kind === "gmail" || ident.kind === "microsoft") && ident.provider_connections?.status !== "connected") fail("bad_request", `${ident.email} needs to be reconnected before sending.`);
    return { org, identity: ident, sendVia: ident.kind as string, fromEmail: ident.email as string, fromName: (ident.name ?? null) as string | null };
  }
  // Platform sender: verified SentLedger domain, customer's address as Reply-To.
  return { org, identity: null, sendVia: "platform", fromEmail: env.PLATFORM_FROM_EMAIL, fromName: `${org.name} via SentLedger` };
}

/** Create a draft / scheduled / immediate message. Same code path for web app, API and extensions. */
export async function createMessage(actor: Actor, input: MessageInput) {
  const orgId = actor.orgId;
  const sender = await resolveSender(orgId, input.sender_identity_id, actor);
  let subject = input.subject;
  let html = input.html;
  let text = input.text ?? "";
  if (input.template_id) {
    const t = must(await db.from("templates").select("*").eq("id", input.template_id).eq("org_id", orgId).is("deleted_at", null).maybeSingle(), "template") as any;
    if (!t) fail("not_found", "Template not found");
    subject = subject || t.subject;
    html = html || t.html;
    text = text || t.text;
    await db.from("templates").update({ use_count: t.use_count + 1 }).eq("id", t.id);
  }
  subject = mergeVars(subject, input.variables, false).replace(/[\r\n]+/g, " ");
  html = cleanHtml(mergeVars(html, input.variables, true));
  text = text ? mergeVars(text, input.variables, false) : htmlToText(html);
  if (!subject.trim()) fail("validation_error", "Subject is required");
  if (!html.trim() && !text.trim()) fail("validation_error", "Message body is required");

  const tracking = { ...sender.org.tracking_defaults, ...input.tracking };
  const all = [...input.to.map((a) => ({ ...a, kind: "to" })), ...input.cc.map((a) => ({ ...a, kind: "cc" })), ...input.bcc.map((a) => ({ ...a, kind: "bcc" }))];
  const unique = new Map(all.map((a) => [a.email, a]));
  if (unique.size !== all.length) fail("validation_error", "Each recipient may appear only once across To, CC and BCC");

  let files: any[] = [];
  if (input.file_ids.length) {
    files = must(await db.from("files").select("*").in("id", input.file_ids).eq("org_id", orgId).is("deleted_at", null), "files") as any[];
    if (files.length !== input.file_ids.length) fail("bad_request", "One or more files were not found");
    if (files.some((f) => f.scan_status === "infected")) fail("bad_request", "A file failed the malware scan and cannot be sent");
  }

  const status = input.send ? (input.scheduled_at && new Date(input.scheduled_at) > new Date() ? "scheduled" : "queued") : "draft";
  const msgRow = {
    org_id: orgId, created_by: actor.userId ?? null, api_key_id: actor.apiKeyId ?? null,
    source: input.source ?? (actor.kind === "api_key" ? "api" : "web"),
    status: "draft", sender_identity_id: sender.identity?.id ?? null, send_via: sender.sendVia,
    from_email: sender.fromEmail, from_name: sender.fromName,
    reply_to: input.reply_to ?? sender.org.default_reply_to ?? (sender.sendVia === "platform" ? actor.email ?? null : null),
    subject, html, text, tags: input.tags, metadata: input.metadata, template_id: input.template_id ?? null,
    correlation_id: input.correlation_id ?? token(9), idempotency_key: null,
    tracking, delivery_mode: input.delivery_mode, group_token: input.delivery_mode === "group" ? token(18) : null,
    unsubscribe_link: input.unsubscribe_link ?? (input.delivery_mode === "individual" && unique.size > 1),
    tracking_notice: sender.org.require_tracking_notice && (tracking.open || tracking.click) ? sender.org.consent_language : null,
    scheduled_at: input.scheduled_at ?? null,
    expires_at: input.file_expires_at ?? null,
  };
  const msg = must(await db.from("messages").insert(msgRow).select("*").single(), "message") as any;

  const rcptRows = [...unique.values()].map((a) => ({ message_id: msg.id, org_id: orgId, kind: a.kind, email: a.email, name: a.name ?? null }));
  const recipients = must(await db.from("message_recipients").insert(rcptRows).select("*"), "recipients") as any[];
  // link recipients to existing contacts
  const contacts = must(await db.from("contacts").select("id, primary_email").eq("org_id", orgId).in("primary_email", recipients.map((r) => r.email)).is("deleted_at", null), "contacts") as any[];
  for (const ct of contacts) {
    const r = recipients.find((x) => x.email === ct.primary_email.toLowerCase());
    if (r) await db.from("message_recipients").update({ contact_id: ct.id }).eq("id", r.id);
  }
  if (files.length) {
    await db.from("message_attachments").insert(files.map((f) => ({ message_id: msg.id, org_id: orgId, file_id: f.id, name: f.name, size: f.size, sha256: f.sha256 })));
  }
  await recordEvent({ orgId, messageId: msg.id, type: "message.created", source: actor.kind === "api_key" ? "api" : "user", data: { by: actor.userId ?? actor.apiKeyId, source: msgRow.source } });

  if (status !== "draft") await queueSend(actor, msg.id, input.scheduled_at ?? null);
  return getMessage(orgId, msg.id);
}

export async function updateDraft(actor: Actor, id: string, input: Partial<MessageInput>) {
  const msg = must(await db.from("messages").select("*").eq("id", id).eq("org_id", actor.orgId).maybeSingle(), "message") as any;
  if (!msg) fail("not_found", "Message not found");
  if (msg.status !== "draft" && msg.status !== "scheduled") fail("conflict", "Only drafts and scheduled messages can be edited. Sent messages are never altered.");
  const patch: Record<string, unknown> = {};
  if (input.subject != null) patch.subject = input.subject.replace(/[\r\n]+/g, " ");
  if (input.html != null) { patch.html = cleanHtml(input.html); patch.text = input.text ?? htmlToText(patch.html as string); }
  if (input.tags) patch.tags = input.tags;
  if (input.metadata) patch.metadata = input.metadata;
  if (input.tracking) patch.tracking = { ...msg.tracking, ...input.tracking };
  if (input.reply_to !== undefined) patch.reply_to = input.reply_to;
  if (input.scheduled_at !== undefined) patch.scheduled_at = input.scheduled_at;
  if (input.delivery_mode) { patch.delivery_mode = input.delivery_mode; patch.group_token = input.delivery_mode === "group" ? (msg.group_token ?? token(18)) : null; }
  if (input.file_expires_at !== undefined) patch.expires_at = input.file_expires_at;
  if (input.sender_identity_id !== undefined) {
    const s = await resolveSender(actor.orgId, input.sender_identity_id, actor);
    Object.assign(patch, { sender_identity_id: s.identity?.id ?? null, send_via: s.sendVia, from_email: s.fromEmail, from_name: s.fromName });
  }
  if (input.file_ids) {
    const files = input.file_ids.length ? must(await db.from("files").select("*").in("id", input.file_ids).eq("org_id", actor.orgId).is("deleted_at", null), "files") as any[] : [];
    if (files.length !== input.file_ids.length) fail("bad_request", "One or more files were not found");
    await db.from("message_attachments").delete().eq("message_id", id);
    if (files.length) await db.from("message_attachments").insert(files.map((f) => ({ message_id: id, org_id: actor.orgId, file_id: f.id, name: f.name, size: f.size, sha256: f.sha256 })));
  }
  if (Object.keys(patch).length) must(await db.from("messages").update(patch).eq("id", id), "update");
  if (input.to || input.cc || input.bcc) {
    await db.from("message_recipients").delete().eq("message_id", id);
    const all = [...(input.to ?? []).map((a) => ({ ...a, kind: "to" })), ...(input.cc ?? []).map((a) => ({ ...a, kind: "cc" })), ...(input.bcc ?? []).map((a) => ({ ...a, kind: "bcc" }))];
    if (all.length) await db.from("message_recipients").insert(all.map((a) => ({ message_id: id, org_id: actor.orgId, kind: a.kind, email: a.email, name: a.name ?? null })));
  }
  return getMessage(actor.orgId, id);
}

/** Freezes content (hash + link capture), enforces plan limits, and queues delivery. */
export async function queueSend(actor: Actor, id: string, scheduledAt: string | null = null) {
  if (actor.orgStatus === "suspended") fail("suspended", "This workspace is suspended");
  const msg = must(await db.from("messages").select("*, message_recipients(id)").eq("id", id).eq("org_id", actor.orgId).single(), "message") as any;
  if (!["draft", "scheduled"].includes(msg.status)) fail("conflict", `Message is already ${msg.status}`);
  const count = msg.delivery_mode === "group" ? 1 : msg.message_recipients.length;
  if (!count) fail("validation_error", "Add at least one recipient");
  await assertCanSend(actor.orgId, count);
  await enforceSendRate(actor.orgId, count);

  const future = scheduledAt && new Date(scheduledAt) > new Date(Date.now() + 30_000);
  const patch = {
    status: future ? "scheduled" : "queued",
    scheduled_at: scheduledAt,
    links: extractLinks(msg.html),
    html_sha256: sha256(msg.html),
    text_sha256: sha256(msg.text),
    content_frozen_at: future ? null : new Date().toISOString(),
  };
  must(await db.from("messages").update(patch).eq("id", id), "queue");
  if (future) {
    await recordEvent({ orgId: actor.orgId, messageId: id, type: "message.scheduled", source: "system", data: { scheduled_at: scheduledAt } });
  } else {
    await recordEvent({ orgId: actor.orgId, messageId: id, type: "message.queued", source: "system", data: { html_sha256: patch.html_sha256, text_sha256: patch.text_sha256, recipients: count } });
    await enqueue("send_message", { message_id: id });
  }
}

// Per-organization burst protection (anti-abuse), independent of monthly quota.
async function enforceSendRate(orgId: string, count: number) {
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count: recent } = await db.from("message_recipients").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", since);
  if ((recent ?? 0) + count > 500) fail("rate_limited", "Hourly sending limit reached (500 recipients/hour). Contact support to raise it for your account.");
}

/** Called by the scheduler for due scheduled messages. */
export async function releaseScheduled() {
  const due = must(await db.from("messages").select("id, org_id, html, text").eq("status", "scheduled").lte("scheduled_at", new Date().toISOString()).limit(50), "due") as any[];
  for (const m of due) {
    const upd = await db.from("messages").update({
      status: "queued", links: extractLinks(m.html), html_sha256: sha256(m.html), text_sha256: sha256(m.text), content_frozen_at: new Date().toISOString(),
    }).eq("id", m.id).eq("status", "scheduled").select("id");
    if (upd.data?.length) {
      await recordEvent({ orgId: m.org_id, messageId: m.id, type: "message.queued", source: "system", data: { scheduled: true } });
      await enqueue("send_message", { message_id: m.id });
    }
  }
}

async function fileLinksFor(msg: any, recipientId: string | null, attachments: any[]) {
  if (!attachments.length || !msg.tracking.files) return [];
  const rows = attachments.map((a) => ({
    org_id: msg.org_id, file_id: a.file_id, message_id: msg.id, recipient_id: recipientId, token: token(24),
    expires_at: msg.expires_at, created_by: msg.created_by,
  }));
  const links = must(await db.from("file_links").insert(rows).select("token, file_id"), "file links") as any[];
  return links.map((l) => {
    const a = attachments.find((x) => x.file_id === l.file_id)!;
    return { name: a.name, size: a.size, token: l.token };
  });
}

/** Job: deliver a queued message through its provider. Safe to retry — accepted recipients are never resent. */
export async function performSend(messageId: string) {
  const msg = must(await db.from("messages").select("*, message_recipients(*), message_attachments(*), sender_identities(connection_id)").eq("id", messageId).single(), "message") as any;
  if (!["queued", "sending"].includes(msg.status)) return;
  await db.from("messages").update({ status: "sending" }).eq("id", messageId);

  const provider = providerFor(msg.send_via, msg.sender_identities?.connection_id);
  const suppressed = new Set(
    ((must(await db.from("suppressions").select("email").eq("org_id", msg.org_id).in("email", msg.message_recipients.map((r: any) => r.email)), "suppressions") as any[]) ?? []).map((s) => s.email.toLowerCase()),
  );
  const base = { from: { email: msg.from_email, name: msg.from_name }, replyTo: msg.reply_to, subject: msg.subject, tags: { message_id: msg.id, org_id: msg.org_id } };
  const sentHeaders = (t: string) => ({
    "X-SentLedger-Message-Id": msg.id,
    "X-SentLedger-Correlation-Id": msg.correlation_id,
    ...(msg.unsubscribe_link ? { "List-Unsubscribe": `<${unsubscribeUrl(t)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}),
  });

  let retryable: ProviderError | null = null;

  if (msg.delivery_mode === "group") {
    const pending = msg.message_recipients.filter((r: any) => r.status === "pending");
    for (const r of pending.filter((r: any) => suppressed.has(r.email))) {
      await db.from("message_recipients").update({ status: "suppressed" }).eq("id", r.id);
      await recordEvent({ orgId: msg.org_id, messageId, recipientId: r.id, type: "message.suppressed", source: "system", data: { email: r.email } });
    }
    const live = pending.filter((r: any) => !suppressed.has(r.email));
    if (live.length) {
      const files = await fileLinksFor(msg, null, msg.message_attachments);
      const content = personalize({ html: msg.html, text: msg.text, token: msg.group_token, tracking: msg.tracking, files, notice: msg.tracking_notice, unsubscribe: false });
      const by = (k: string) => live.filter((r: any) => r.kind === k).map((r: any) => ({ email: r.email, name: r.name }));
      const out: OutboundEmail = { ...base, to: by("to"), cc: by("cc"), bcc: by("bcc"), html: content.html, text: content.text, headers: sentHeaders(msg.group_token) };
      if (!out.to.length) { out.to = out.cc!.length ? out.cc! : out.bcc!; }
      try {
        const res = await provider.send(out);
        await db.from("message_recipients").update({ status: "accepted", provider_message_id: res.providerMessageId }).in("id", live.map((r: any) => r.id));
        await db.from("messages").update({ provider_message_id: res.providerMessageId }).eq("id", messageId);
        await recordEvent({ orgId: msg.org_id, messageId, type: "message.sent", source: "provider", data: {
          provider: provider.name, provider_message_id: res.providerMessageId, delivery_mode: "group",
          recipients: live.map((r: any) => ({ email: r.email, kind: r.kind })), delivered_html_sha256: sha256(content.html), delivered_text_sha256: sha256(content.text),
        } });
      } catch (e) {
        const err = e as ProviderError;
        if (err.retryable) retryable = err;
        else {
          await db.from("message_recipients").update({ status: "failed", error: err.message }).in("id", live.map((r: any) => r.id));
          await recordEvent({ orgId: msg.org_id, messageId, type: "message.failed", source: "provider", data: { provider: provider.name, error: err.message } });
        }
      }
    }
  } else {
    for (const r of msg.message_recipients.filter((x: any) => x.status === "pending")) {
      if (suppressed.has(r.email)) {
        await db.from("message_recipients").update({ status: "suppressed" }).eq("id", r.id);
        await recordEvent({ orgId: msg.org_id, messageId, recipientId: r.id, type: "message.suppressed", source: "system", data: { email: r.email } });
        continue;
      }
      const files = await fileLinksFor(msg, r.id, msg.message_attachments);
      const content = personalize({ html: msg.html, text: msg.text, token: r.token, tracking: msg.tracking, files, notice: msg.tracking_notice, unsubscribe: msg.unsubscribe_link });
      try {
        const res = await provider.send({ ...base, to: [{ email: r.email, name: r.name }], html: content.html, text: content.text, headers: sentHeaders(r.token) });
        await db.from("message_recipients").update({ status: "accepted", provider_message_id: res.providerMessageId }).eq("id", r.id);
        await recordEvent({ orgId: msg.org_id, messageId, recipientId: r.id, type: "message.sent", source: "provider", data: {
          provider: provider.name, provider_message_id: res.providerMessageId, to: r.email, kind: r.kind,
          delivered_html_sha256: sha256(content.html), delivered_text_sha256: sha256(content.text),
        } });
      } catch (e) {
        const err = e as ProviderError;
        if (err.retryable) { retryable = err; break; }
        await db.from("message_recipients").update({ status: "failed", error: err.message }).eq("id", r.id);
        await recordEvent({ orgId: msg.org_id, messageId, recipientId: r.id, type: "message.failed", source: "provider", data: { provider: provider.name, error: err.message } });
      }
    }
  }

  const final = must(await db.from("message_recipients").select("status").eq("message_id", messageId), "recipients") as any[];
  const accepted = final.filter((r) => ["accepted", "delivered"].includes(r.status)).length;
  const failed = final.filter((r) => r.status === "failed").length;
  const pending = final.filter((r) => r.status === "pending").length;

  if (retryable && pending) {
    await db.from("messages").update({ status: "queued", provider: provider.name, error: retryable.message }).eq("id", messageId);
    throw new RetryLater(retryable.message);
  }
  const status = accepted === 0 ? "failed" : failed ? "partially_failed" : "sent";
  const sendsCounted = msg.delivery_mode === "group" ? (accepted ? 1 : 0) : accepted;
  await db.from("messages").update({ status, sent_at: accepted ? new Date().toISOString() : null, provider: provider.name, error: status === "failed" ? "All recipients failed" : null, content_frozen_at: msg.content_frozen_at ?? new Date().toISOString() }).eq("id", messageId);
  if (sendsCounted) await recordSends(msg.org_id, sendsCounted);
  log.info("message sent", { messageId, status, accepted, failed, provider: provider.name });
}

registerJob("send_message", async (p) => {
  try {
    await performSend(p.message_id);
  } catch (e) {
    if (e instanceof RetryLater) throw e;
    const err = e as Error;
    await db.from("messages").update({ status: "failed", error: err.message.slice(0, 500) }).eq("id", p.message_id).in("status", ["queued", "sending"]);
    const m = (await db.from("messages").select("org_id").eq("id", p.message_id).single()).data;
    if (m) await recordEvent({ orgId: m.org_id, messageId: p.message_id, type: "message.failed", source: "system", data: { error: err.message } });
    throw err;
  }
});

export async function getMessage(orgId: string, id: string) {
  const res = await db.from("messages")
    .select("*, message_recipients(*), message_attachments(*), sender_identities(id, kind, email, name)")
    .eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle();
  const m = must(res, "message");
  if (!m) fail("not_found", "Message not found");
  return m as any;
}

export async function revokeMessage(actor: Actor, id: string, reason?: string) {
  const m = await getMessage(actor.orgId, id);
  if (m.revoked_at) return m;
  const now = new Date().toISOString();
  await db.from("messages").update({ revoked_at: now }).eq("id", id);
  await db.from("file_links").update({ revoked_at: now }).eq("message_id", id).is("revoked_at", null);
  await recordEvent({ orgId: actor.orgId, messageId: id, type: "message.revoked", source: actor.kind === "api_key" ? "api" : "user", data: { reason: reason ?? null, scope: "secure_files_and_links" } });
  return getMessage(actor.orgId, id);
}
