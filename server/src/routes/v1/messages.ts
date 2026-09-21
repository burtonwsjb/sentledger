import { Hono } from "hono";
import { z } from "zod";
import { db, must } from "../../lib/db";
import { fail } from "../../lib/errors";
import { need, needWritable, type AppEnv } from "../../lib/auth";
import { audit } from "../../lib/audit";
import { applyCursor, body, listQuery, page, query, withIdempotency } from "../../lib/http";
import { actorLimit } from "../../lib/ratelimit";
import { createMessage, getMessage, MessageInput, queueSend, revokeMessage, updateDraft } from "../../services/messages";
import { recordEvent } from "../../services/events";
import { buildLedger, evidencePackage, ledgerCsv, ledgerPdf } from "../../services/evidence";

export const messages = new Hono<AppEnv>();

const ListFilters = listQuery.extend({
  status: z.string().optional(),
  q: z.string().max(200).optional(),
  recipient: z.string().max(254).optional(),
  sender: z.string().max(254).optional(),
  tag: z.string().max(50).optional(),
  source: z.enum(["web", "api", "extension"]).optional(),
  api_key_id: z.string().uuid().optional(),
  activity: z.enum(["opened", "clicked", "file_viewed", "not_opened", "bounced"]).optional(),
  archived: z.enum(["true", "false"]).optional(),
  correlation_id: z.string().max(200).optional(),
});

/** Public shape of a message list row. */
const listSelect = "id, status, subject, from_email, from_name, source, send_via, delivery_mode, tags, metadata, correlation_id, created_at, sent_at, scheduled_at, revoked_at, archived_at, api_key_id, message_recipients(id, kind, email, name, status, open_count, click_count, file_view_count, first_opened_at, delivered_at)";

messages.get("/messages", async (c) => {
  const a = need(c, "messages:read");
  const f = query(c, ListFilters);
  let q = db.from("messages").select(listSelect).eq("org_id", a.orgId).is("deleted_at", null)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(f.limit + 1);
  if (f.archived === "true") q = q.not("archived_at", "is", null);
  else q = q.is("archived_at", null);
  if (f.status) q = q.in("status", f.status.split(","));
  if (f.tag) q = q.contains("tags", [f.tag]);
  if (f.source) q = q.eq("source", f.source);
  if (f.api_key_id) q = q.eq("api_key_id", f.api_key_id);
  if (f.correlation_id) q = q.eq("correlation_id", f.correlation_id);
  if (f.sender) q = q.ilike("from_email", `%${f.sender}%`);
  if (f.from) q = q.gte("created_at", f.from);
  if (f.to) q = q.lte("created_at", f.to);
  // metadata[key]=value filters
  for (const [k, v] of Object.entries(c.req.queries() ?? {})) {
    const m = /^metadata\[(.+)\]$/.exec(k);
    if (m && v[0] != null) q = q.eq(`metadata->>${m[1]!.replace(/[^a-zA-Z0-9_]/g, "")}`, v[0]);
  }
  if (f.q || f.recipient || f.activity) {
    // resolve matching message ids via recipients / subject search
    const ids = new Set<string>();
    let restrict = false;
    if (f.recipient || f.q) {
      restrict = true;
      const term = (f.recipient ?? f.q)!.replace(/[%,()]/g, "");
      const r = must(await db.from("message_recipients").select("message_id").eq("org_id", a.orgId).ilike("email", `%${term}%`).limit(1000), "search") as any[];
      r.forEach((x) => ids.add(x.message_id));
      if (f.q) {
        const s = must(await db.from("messages").select("id").eq("org_id", a.orgId).ilike("subject", `%${term}%`).limit(1000), "search") as any[];
        s.forEach((x) => ids.add(x.id));
      }
    }
    if (f.activity) {
      const col = { opened: "open_count", clicked: "click_count", file_viewed: "file_view_count" } as const;
      let rq = db.from("message_recipients").select("message_id").eq("org_id", a.orgId).limit(2000);
      if (f.activity === "not_opened") rq = rq.eq("open_count", 0).in("status", ["accepted", "delivered"]);
      else if (f.activity === "bounced") rq = rq.eq("status", "bounced");
      else rq = rq.gt(col[f.activity], 0);
      const r = must(await rq, "activity") as any[];
      const act = new Set(r.map((x) => x.message_id));
      if (restrict) for (const id of [...ids]) { if (!act.has(id)) ids.delete(id); }
      else act.forEach((id) => ids.add(id));
      restrict = true;
    }
    if (restrict) {
      if (!ids.size) return c.json({ data: [], has_more: false, next_cursor: null });
      q = q.in("id", [...ids].slice(0, 500));
    }
  }
  q = applyCursor(q, f.cursor);
  const rows = must(await q, "messages") as any[];
  return c.json(page(rows, f.limit));
});

messages.post("/messages", actorLimit("send", 120, 60_000), async (c) => {
  const a = needWritable(c, "messages:write");
  const raw = await c.req.json().catch(() => fail("bad_request", "Request body must be valid JSON"));
  const input = MessageInput.parse(raw);
  return withIdempotency(c, a.orgId, raw, async () => {
    const m = await createMessage(a, input);
    if (c.req.header("idempotency-key")) await db.from("messages").update({ idempotency_key: c.req.header("idempotency-key") }).eq("id", m.id);
    if (input.send) await audit(c, "message.send", { targetType: "message", targetId: m.id, data: { recipients: m.message_recipients.length } });
    return { status: 201, body: await getMessage(a.orgId, m.id) };
  });
});

messages.get("/messages/:id", async (c) => {
  const a = need(c, "messages:read");
  const m = await getMessage(a.orgId, c.req.param("id"));
  const events = must(await db.from("events").select("*").eq("message_id", m.id).order("seq"), "events");
  const files = must(await db.from("file_links").select("id, token, file_id, recipient_id, expires_at, revoked_at, view_count, created_at").eq("message_id", m.id), "file links");
  return c.json({ ...m, events, file_links: files });
});

messages.patch("/messages/:id", async (c) => {
  const a = needWritable(c, "messages:write");
  const input = await body(c, MessageInput.partial());
  return c.json(await updateDraft(a, c.req.param("id"), input));
});

messages.post("/messages/:id/send", actorLimit("send", 120, 60_000), async (c) => {
  const a = needWritable(c, "messages:write");
  const b = await c.req.json().catch(() => ({}));
  const scheduled = z.object({ scheduled_at: z.string().datetime({ offset: true }).nullish() }).parse(b ?? {});
  return withIdempotency(c, a.orgId, { id: c.req.param("id"), ...b }, async () => {
    await queueSend(a, c.req.param("id"), scheduled.scheduled_at ?? null);
    await audit(c, "message.send", { targetType: "message", targetId: c.req.param("id") });
    return { status: 202, body: await getMessage(a.orgId, c.req.param("id")) };
  });
});

messages.post("/messages/:id/cancel", async (c) => {
  const a = needWritable(c, "messages:write");
  const m = await getMessage(a.orgId, c.req.param("id"));
  if (m.status !== "scheduled") fail("conflict", "Only scheduled messages can be cancelled");
  await db.from("messages").update({ status: "draft", scheduled_at: null }).eq("id", m.id);
  await audit(c, "message.schedule_cancelled", { targetType: "message", targetId: m.id });
  return c.json(await getMessage(a.orgId, m.id));
});

messages.post("/messages/:id/revoke", async (c) => {
  const a = needWritable(c, "messages:write");
  const b = z.object({ reason: z.string().max(500).optional() }).parse(await c.req.json().catch(() => ({})));
  const m = await revokeMessage(a, c.req.param("id"), b.reason);
  await audit(c, "message.revoke", { targetType: "message", targetId: m.id });
  return c.json(m);
});

messages.post("/messages/:id/duplicate", async (c) => {
  const a = needWritable(c, "messages:write");
  const m = await getMessage(a.orgId, c.req.param("id"));
  const by = (k: string) => m.message_recipients.filter((r: any) => r.kind === k).map((r: any) => ({ email: r.email, name: r.name }));
  const copy = await createMessage(a, MessageInput.parse({
    to: by("to").length ? by("to") : by("cc"), cc: by("to").length ? by("cc") : [], bcc: by("bcc"), subject: m.subject, html: m.html, text: m.text,
    reply_to: m.reply_to, sender_identity_id: m.sender_identity_id, tags: m.tags, metadata: { ...m.metadata, duplicated_from: m.id },
    tracking: m.tracking, delivery_mode: m.delivery_mode, file_ids: m.message_attachments.map((x: any) => x.file_id), send: false,
  }));
  return c.json(copy, 201);
});

messages.post("/messages/:id/resend", actorLimit("send", 120, 60_000), async (c) => {
  const a = needWritable(c, "messages:write");
  const m = await getMessage(a.orgId, c.req.param("id"));
  if (m.status === "draft") fail("conflict", "This message has not been sent yet");
  const by = (k: string) => m.message_recipients.filter((r: any) => r.kind === k).map((r: any) => ({ email: r.email, name: r.name }));
  const copy = await createMessage(a, MessageInput.parse({
    to: by("to").length ? by("to") : by("cc"), cc: by("to").length ? by("cc") : [], bcc: by("bcc"), subject: m.subject, html: m.html, text: m.text,
    reply_to: m.reply_to, sender_identity_id: m.sender_identity_id, tags: m.tags, metadata: { ...m.metadata, resend_of: m.id },
    tracking: m.tracking, delivery_mode: m.delivery_mode, file_ids: m.message_attachments.map((x: any) => x.file_id), send: true,
  }));
  await audit(c, "message.resend", { targetType: "message", targetId: copy.id, data: { original: m.id } });
  return c.json(copy, 201);
});

messages.post("/messages/:id/archive", async (c) => {
  const a = needWritable(c, "messages:write");
  const m = await getMessage(a.orgId, c.req.param("id"));
  const archived = !m.archived_at;
  await db.from("messages").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", m.id);
  if (archived) await recordEvent({ orgId: a.orgId, messageId: m.id, type: "message.archived", source: a.kind === "api_key" ? "api" : "user", data: {} });
  return c.json(await getMessage(a.orgId, m.id));
});

/** Soft delete: hidden from lists; ledger events are kept until the retention window ends. */
messages.delete("/messages/:id", async (c) => {
  const a = needWritable(c, "messages:write");
  const m = await getMessage(a.orgId, c.req.param("id"));
  const privileged = a.kind === "api_key" || a.role === "owner" || a.role === "admin" || m.created_by === a.userId;
  if (!privileged) fail("forbidden", "Only the sender or a workspace admin can delete this message");
  if (m.status === "draft") {
    await db.from("messages").delete().eq("id", m.id);
  } else {
    await recordEvent({ orgId: a.orgId, messageId: m.id, type: "message.deleted", source: a.kind === "api_key" ? "api" : "user", data: { soft: true } });
    await db.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", m.id);
  }
  await audit(c, "message.delete", { targetType: "message", targetId: m.id, data: { status: m.status } });
  return c.body(null, 204);
});

messages.get("/messages/:id/events", async (c) => {
  const a = need(c, "events:read");
  await getMessage(a.orgId, c.req.param("id"));
  const rows = must(await db.from("events").select("*").eq("message_id", c.req.param("id")).eq("org_id", a.orgId).order("seq"), "events");
  return c.json({ data: rows });
});

messages.get("/messages/:id/evidence", async (c) => {
  const a = need(c, "messages:read");
  const format = z.enum(["json", "csv", "pdf", "zip"]).default("json").parse(c.req.query("format") ?? "json");
  const id = c.req.param("id");
  await recordEvent({ orgId: a.orgId, messageId: id, type: "message.exported", source: a.kind === "api_key" ? "api" : "user", data: { format, by: a.userId ?? a.apiKeyId } });
  await audit(c, "message.export", { targetType: "message", targetId: id, data: { format } });
  const l = await buildLedger(a.orgId, id);
  const name = `sentledger-${id.slice(0, 8)}`;
  if (format === "json") return c.json(l);
  if (format === "csv") return new Response(ledgerCsv(l), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-events.csv"` } });
  if (format === "pdf") return new Response(Buffer.from(await ledgerPdf(l)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}-report.pdf"` } });
  const pkg = await evidencePackage(l);
  return new Response(Buffer.from(pkg.zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}-evidence.zip"`, "X-Manifest-Sha256": pkg.manifest.files.map((f) => f.sha256).join(",") } });
});

// ---- Org-wide event feed ----
messages.get("/events", async (c) => {
  const a = need(c, "events:read");
  const f = query(c, listQuery.extend({ type: z.string().optional(), message_id: z.string().uuid().optional(), include_duplicates: z.enum(["true", "false"]).optional() }));
  let q = db.from("events").select("id, seq, message_id, recipient_id, type, occurred_at, source, device, is_proxy, uncertain, is_duplicate, data, hash, created_at, message_recipients(email), messages(subject)")
    .eq("org_id", a.orgId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(f.limit + 1);
  if (f.type) q = q.in("type", f.type.split(","));
  if (f.message_id) q = q.eq("message_id", f.message_id);
  if (f.include_duplicates !== "true") q = q.eq("is_duplicate", false);
  if (f.from) q = q.gte("occurred_at", f.from);
  if (f.to) q = q.lte("occurred_at", f.to);
  q = applyCursor(q, f.cursor);
  return c.json(page(must(await q, "events") as any[], f.limit));
});
