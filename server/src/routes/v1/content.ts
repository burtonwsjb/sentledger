import { Hono } from "hono";
import { z } from "zod";
import { env } from "../../env";
import { db, must } from "../../lib/db";
import { fail } from "../../lib/errors";
import { sha256, token } from "../../lib/crypto";
import { need, needWritable, type AppEnv } from "../../lib/auth";
import { audit } from "../../lib/audit";
import { applyCursor, body, listQuery, page, query } from "../../lib/http";
import { planState } from "../../lib/plan";
import { cleanHtml, findVariables, htmlToText } from "../../services/compose";
import { fileUrl } from "../../services/compose";

export const content = new Hono<AppEnv>();

// ================= Templates =================
const TemplateInput = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().max(998).default(""),
  html: z.string().max(500_000).default(""),
  text: z.string().max(500_000).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  folder_id: z.string().uuid().nullable().optional(),
  visibility: z.enum(["org", "private"]).default("org"),
});

content.get("/templates", async (c) => {
  const a = need(c, "templates:read");
  const f = query(c, listQuery.extend({ q: z.string().max(100).optional(), folder_id: z.string().uuid().optional(), tag: z.string().optional() }));
  let q = db.from("templates").select("id, name, subject, tags, folder_id, visibility, version, use_count, variables, created_by, created_at, updated_at")
    .eq("org_id", a.orgId).is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(f.limit + 1);
  if (a.kind === "user") q = q.or(`visibility.eq.org,created_by.eq.${a.userId}`);
  else q = q.eq("visibility", "org");
  if (f.q) q = q.ilike("name", `%${f.q.replace(/[%,()]/g, "")}%`);
  if (f.folder_id) q = q.eq("folder_id", f.folder_id);
  if (f.tag) q = q.contains("tags", [f.tag]);
  q = applyCursor(q, f.cursor);
  const folders = must(await db.from("template_folders").select("id, name").eq("org_id", a.orgId).order("name"), "folders");
  return c.json({ ...page(must(await q, "templates") as any[], f.limit), folders });
});

content.post("/templates", async (c) => {
  const a = needWritable(c, "templates:write");
  const b = await body(c, TemplateInput);
  const html = cleanHtml(b.html);
  const text = b.text ?? htmlToText(html);
  const t = must(await db.from("templates").insert({
    org_id: a.orgId, name: b.name, subject: b.subject, html, text, tags: b.tags, folder_id: b.folder_id ?? null,
    visibility: b.visibility, variables: findVariables(b.subject, html, text), created_by: a.userId ?? null,
  }).select("*").single(), "template") as any;
  await db.from("template_versions").insert({ template_id: t.id, org_id: a.orgId, version: 1, subject: t.subject, html: t.html, text: t.text, created_by: a.userId ?? null });
  return c.json(t, 201);
});

async function loadTemplate(orgId: string, id: string) {
  const t = must(await db.from("templates").select("*").eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle(), "template");
  if (!t) fail("not_found", "Template not found");
  return t as any;
}

content.get("/templates/:id", async (c) => {
  const a = need(c, "templates:read");
  const t = await loadTemplate(a.orgId, c.req.param("id"));
  if (t.visibility === "private" && t.created_by !== a.userId) fail("not_found", "Template not found");
  const versions = must(await db.from("template_versions").select("id, version, subject, created_by, created_at").eq("template_id", t.id).order("version", { ascending: false }), "versions");
  return c.json({ ...t, versions });
});

content.patch("/templates/:id", async (c) => {
  const a = needWritable(c, "templates:write");
  const t = await loadTemplate(a.orgId, c.req.param("id"));
  const b = await body(c, TemplateInput.partial());
  const patch: Record<string, unknown> = { ...b, updated_at: new Date().toISOString() };
  const contentChanged = b.subject != null || b.html != null || b.text != null;
  if (b.html != null) { patch.html = cleanHtml(b.html); patch.text = b.text ?? htmlToText(patch.html as string); }
  if (contentChanged) {
    patch.version = t.version + 1;
    patch.variables = findVariables(String(patch.subject ?? t.subject), String(patch.html ?? t.html), String(patch.text ?? t.text));
  }
  const u = must(await db.from("templates").update(patch).eq("id", t.id).select("*").single(), "template") as any;
  if (contentChanged) await db.from("template_versions").insert({ template_id: t.id, org_id: a.orgId, version: u.version, subject: u.subject, html: u.html, text: u.text, created_by: a.userId ?? null });
  return c.json(u);
});

content.get("/templates/:id/versions/:version", async (c) => {
  const a = need(c, "templates:read");
  const v = must(await db.from("template_versions").select("*").eq("template_id", c.req.param("id")).eq("org_id", a.orgId).eq("version", Number(c.req.param("version"))).maybeSingle(), "version");
  if (!v) fail("not_found", "Version not found");
  return c.json(v);
});

content.post("/templates/:id/duplicate", async (c) => {
  const a = needWritable(c, "templates:write");
  const t = await loadTemplate(a.orgId, c.req.param("id"));
  const copy = must(await db.from("templates").insert({
    org_id: a.orgId, name: `${t.name} (copy)`, subject: t.subject, html: t.html, text: t.text, tags: t.tags, folder_id: t.folder_id,
    visibility: t.visibility, variables: t.variables, created_by: a.userId ?? null,
  }).select("*").single(), "template") as any;
  await db.from("template_versions").insert({ template_id: copy.id, org_id: a.orgId, version: 1, subject: copy.subject, html: copy.html, text: copy.text, created_by: a.userId ?? null });
  return c.json(copy, 201);
});

content.delete("/templates/:id", async (c) => {
  const a = needWritable(c, "templates:write");
  await loadTemplate(a.orgId, c.req.param("id"));
  await db.from("templates").update({ deleted_at: new Date().toISOString() }).eq("id", c.req.param("id"));
  return c.body(null, 204);
});

content.post("/template-folders", async (c) => {
  const a = needWritable(c, "templates:write");
  const b = await body(c, z.object({ name: z.string().trim().min(1).max(80) }));
  return c.json(must(await db.from("template_folders").insert({ org_id: a.orgId, name: b.name }).select("*").single(), "folder"), 201);
});

content.delete("/template-folders/:id", async (c) => {
  const a = needWritable(c, "templates:write");
  await db.from("template_folders").delete().eq("id", c.req.param("id")).eq("org_id", a.orgId);
  return c.body(null, 204);
});

// ================= Contacts =================
const ContactInput = z.object({
  name: z.string().max(200).nullish(),
  company: z.string().max(200).nullish(),
  primary_email: z.string().trim().toLowerCase().email(),
  emails: z.array(z.string().trim().toLowerCase().email()).max(10).default([]),
  tags: z.array(z.string().max(50)).max(30).default([]),
  notes: z.string().max(5000).nullish(),
  consent: z.object({ tracking: z.boolean().optional(), marketing: z.boolean().optional(), source: z.string().max(200).optional(), recorded_at: z.string().optional() }).partial().default({}),
  custom: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

content.get("/contacts", async (c) => {
  const a = need(c, "contacts:read");
  const f = query(c, listQuery.extend({ q: z.string().max(200).optional(), tag: z.string().max(50).optional() }));
  let q = db.from("contacts").select("*").eq("org_id", a.orgId).is("deleted_at", null)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(f.limit + 1);
  if (f.q) {
    const t = f.q.replace(/[%,()]/g, "");
    q = q.or(`name.ilike.%${t}%,company.ilike.%${t}%,primary_email.ilike.%${t}%`);
  }
  if (f.tag) q = q.contains("tags", [f.tag]);
  q = applyCursor(q, f.cursor);
  return c.json(page(must(await q, "contacts") as any[], f.limit));
});

content.post("/contacts", async (c) => {
  const a = needWritable(c, "contacts:write");
  const b = await body(c, ContactInput);
  const r = await db.from("contacts").insert({ ...b, org_id: a.orgId, emails: [...new Set([b.primary_email, ...b.emails])] }).select("*").single();
  if (r.error?.code === "23505") fail("conflict", "A contact with that email already exists");
  return c.json(must(r, "contact"), 201);
});

content.get("/contacts/:id", async (c) => {
  const a = need(c, "contacts:read");
  const ct = must(await db.from("contacts").select("*").eq("id", c.req.param("id")).eq("org_id", a.orgId).is("deleted_at", null).maybeSingle(), "contact") as any;
  if (!ct) fail("not_found", "Contact not found");
  const history = must(await db.from("message_recipients").select("id, kind, status, open_count, click_count, file_view_count, first_opened_at, created_at, messages!inner(id, subject, status, sent_at, created_at, deleted_at)")
    .eq("org_id", a.orgId).in("email", ct.emails.length ? ct.emails : [ct.primary_email]).is("messages.deleted_at", null).order("created_at", { ascending: false }).limit(100), "history");
  const suppression = must(await db.from("suppressions").select("reason, created_at").eq("org_id", a.orgId).eq("email", ct.primary_email).maybeSingle(), "suppression");
  return c.json({ ...ct, history, suppression });
});

content.patch("/contacts/:id", async (c) => {
  const a = needWritable(c, "contacts:write");
  const b = await body(c, ContactInput.partial());
  const patch: Record<string, unknown> = { ...b, updated_at: new Date().toISOString() };
  if (b.primary_email || b.emails) {
    const cur = must(await db.from("contacts").select("primary_email, emails").eq("id", c.req.param("id")).eq("org_id", a.orgId).single(), "contact") as any;
    patch.emails = [...new Set([b.primary_email ?? cur.primary_email, ...(b.emails ?? cur.emails)])];
  }
  const r = await db.from("contacts").update(patch).eq("id", c.req.param("id")).eq("org_id", a.orgId).is("deleted_at", null).select("*").maybeSingle();
  if (r.error?.code === "23505") fail("conflict", "Another contact already uses that email");
  const ct = must(r, "contact");
  if (!ct) fail("not_found", "Contact not found");
  return c.json(ct);
});

content.delete("/contacts/:id", async (c) => {
  const a = needWritable(c, "contacts:write");
  await db.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", c.req.param("id")).eq("org_id", a.orgId);
  return c.body(null, 204);
});

/** CSV parser supporting quoted fields, embedded commas/newlines and escaped quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

content.post("/contacts/import", async (c) => {
  const a = needWritable(c, "contacts:write");
  const ct = c.req.header("content-type") ?? "";
  let csv = "";
  let mode: "skip" | "update" = "skip";
  if (ct.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    const f = form.file;
    csv = typeof f === "string" ? f : await (f as File).text();
    mode = form.duplicates === "update" ? "update" : "skip";
  } else {
    csv = await c.req.text();
    mode = c.req.query("duplicates") === "update" ? "update" : "skip";
  }
  if (csv.length > 5_000_000) fail("bad_request", "CSV is larger than 5 MB");
  const rows = parseCsv(csv.replace(/^﻿/, ""));
  if (rows.length < 2) fail("validation_error", "CSV needs a header row and at least one contact");
  const header = rows[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (n: string[]) => header.findIndex((h) => n.includes(h));
  const iEmail = col(["email", "primary_email", "email_address", "e-mail"]);
  if (iEmail < 0) fail("validation_error", "CSV must include an 'email' column");
  const iName = col(["name", "full_name", "contact_name"]);
  const iCompany = col(["company", "organization", "organisation"]);
  const iTags = col(["tags"]);
  const iNotes = col(["notes"]);
  const known = new Set([iEmail, iName, iCompany, iTags, iNotes]);

  const errors: { row: number; error: string }[] = [];
  const seen = new Set<string>();
  const valid: any[] = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const email = (r[iEmail] ?? "").trim().toLowerCase();
    if (!z.string().email().safeParse(email).success) return errors.push({ row: line, error: `Invalid email "${email}"` });
    if (seen.has(email)) return errors.push({ row: line, error: `Duplicate email ${email} in file` });
    seen.add(email);
    const custom: Record<string, string> = {};
    header.forEach((h, i) => { if (!known.has(i) && r[i]?.trim()) custom[h] = r[i]!.trim().slice(0, 500); });
    valid.push({
      org_id: a.orgId, primary_email: email, emails: [email], name: iName >= 0 ? r[iName]?.trim() || null : null,
      company: iCompany >= 0 ? r[iCompany]?.trim() || null : null, notes: iNotes >= 0 ? r[iNotes]?.trim() || null : null,
      tags: iTags >= 0 ? (r[iTags] ?? "").split(/[;|]/).map((t) => t.trim()).filter(Boolean) : [], custom,
    });
  });
  if (valid.length > 10_000) fail("bad_request", "Import at most 10,000 contacts at a time");

  const existing = new Map<string, string>();
  for (let i = 0; i < valid.length; i += 500) {
    const chunk = valid.slice(i, i + 500).map((v) => v.primary_email);
    const ex = must(await db.from("contacts").select("id, primary_email").eq("org_id", a.orgId).is("deleted_at", null).in("primary_email", chunk), "existing") as any[];
    ex.forEach((e) => existing.set(e.primary_email.toLowerCase(), e.id));
  }
  const toInsert = valid.filter((v) => !existing.has(v.primary_email));
  const toUpdate = mode === "update" ? valid.filter((v) => existing.has(v.primary_email)) : [];
  for (let i = 0; i < toInsert.length; i += 500) must(await db.from("contacts").insert(toInsert.slice(i, i + 500)), "import");
  for (const u of toUpdate) {
    const { org_id: _o, primary_email: _p, emails: _e, ...rest } = u;
    await db.from("contacts").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", existing.get(u.primary_email)!);
  }
  await audit(c, "contacts.import", { data: { created: toInsert.length, updated: toUpdate.length, skipped: valid.length - toInsert.length - toUpdate.length, errors: errors.length } });
  return c.json({ created: toInsert.length, updated: toUpdate.length, skipped_duplicates: valid.length - toInsert.length - toUpdate.length, errors });
});

content.get("/contacts-export", async (c) => {
  const a = need(c, "contacts:read");
  const rows = must(await db.from("contacts").select("name, company, primary_email, emails, tags, notes, custom, created_at").eq("org_id", a.orgId).is("deleted_at", null).order("created_at").limit(50_000), "contacts") as any[];
  const customKeys = [...new Set(rows.flatMap((r) => Object.keys(r.custom ?? {})))];
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
  };
  const lines = [["email", "name", "company", "other_emails", "tags", "notes", "created_at", ...customKeys].join(",")];
  for (const r of rows) lines.push([r.primary_email, r.name, r.company, r.emails.filter((e: string) => e !== r.primary_email).join(";"), r.tags.join(";"), r.notes, r.created_at, ...customKeys.map((k) => r.custom?.[k])].map(cell).join(","));
  await audit(c, "contacts.export", { data: { count: rows.length } });
  return new Response(lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="sentledger-contacts.csv"' } });
});

// ================= Suppressions =================
content.get("/suppressions", async (c) => {
  const a = need(c, "contacts:read");
  const f = query(c, listQuery.extend({ q: z.string().max(200).optional(), reason: z.string().optional() }));
  let q = db.from("suppressions").select("*").eq("org_id", a.orgId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(f.limit + 1);
  if (f.q) q = q.ilike("email", `%${f.q.replace(/[%,()]/g, "")}%`);
  if (f.reason) q = q.eq("reason", f.reason);
  q = applyCursor(q, f.cursor);
  return c.json(page(must(await q, "suppressions") as any[], f.limit));
});

content.post("/suppressions", async (c) => {
  const a = needWritable(c, "contacts:write");
  const b = await body(c, z.object({ email: z.string().trim().toLowerCase().email(), reason: z.enum(["manual", "unsubscribe", "bounce", "complaint"]).default("manual"), note: z.string().max(500).optional() }));
  const r = must(await db.from("suppressions").upsert({ org_id: a.orgId, email: b.email, reason: b.reason, note: b.note ?? null }, { onConflict: "org_id,email" }).select("*").single(), "suppression");
  await audit(c, "suppression.add", { targetType: "email", targetId: b.email, data: { reason: b.reason } });
  return c.json(r, 201);
});

content.delete("/suppressions/:id", async (c) => {
  const a = needWritable(c, "contacts:write");
  const s = must(await db.from("suppressions").select("email, reason").eq("id", c.req.param("id")).eq("org_id", a.orgId).maybeSingle(), "suppression") as any;
  if (!s) fail("not_found", "Suppression not found");
  if (s.reason === "complaint" && a.role !== "owner" && a.role !== "admin") fail("forbidden", "Only admins can remove spam-complaint suppressions");
  await db.from("suppressions").delete().eq("id", c.req.param("id"));
  await audit(c, "suppression.remove", { targetType: "email", targetId: s.email, data: { reason: s.reason } });
  return c.body(null, 204);
});

// ================= Secure files =================
const BLOCKED_EXT = /\.(exe|bat|cmd|com|scr|pif|vbs|vbe|js|jse|wsf|wsh|msi|msp|jar|ps1|psm1|hta|cpl|dll|reg|lnk|iso|img)$/i;
const MAX_FILE = 25 * 1024 * 1024;

async function scan(bytes: Uint8Array, name: string): Promise<"clean" | "infected" | "skipped"> {
  if (!env.MALWARE_SCAN_URL) return "skipped";
  try {
    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart]), name);
    const r = await fetch(env.MALWARE_SCAN_URL, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
    const j: any = await r.json();
    return j.infected === true || j.clean === false ? "infected" : "clean";
  } catch {
    return "skipped";
  }
}

content.post("/files", async (c) => {
  const a = needWritable(c, "files:write");
  const form = await c.req.parseBody();
  const f = form.file;
  if (!f || typeof f === "string") fail("validation_error", "Upload a file in the 'file' form field");
  const file = f as File;
  if (file.size > MAX_FILE) fail("bad_request", "Files can be at most 25 MB");
  if (BLOCKED_EXT.test(file.name)) fail("bad_request", "Executable and script files can't be shared");
  const p = await planState(a.orgId);
  if (p.entitlements.attachment_storage_mb != null) {
    const used = (must(await db.from("files").select("size").eq("org_id", a.orgId).is("deleted_at", null), "usage") as any[]).reduce((s, x) => s + Number(x.size), 0);
    if (used + file.size > p.entitlements.attachment_storage_mb * 1024 * 1024) fail("plan_limit", `Your plan includes ${p.entitlements.attachment_storage_mb} MB of file storage. Delete files or upgrade.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = sha256(bytes);
  const path = `${a.orgId}/${crypto.randomUUID()}`;
  const up = await db.storage.from("secure-files").upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (up.error) fail("provider_error", `Upload failed: ${up.error.message}`);
  const status = await scan(bytes, file.name);
  const row = must(await db.from("files").insert({
    org_id: a.orgId, name: file.name.slice(0, 255), mime: file.type || "application/octet-stream", size: file.size, sha256: hash,
    storage_path: path, scan_status: status, created_by: a.userId ?? null,
  }).select("*").single(), "file") as any;
  if (status === "infected") await db.storage.from("secure-files").remove([path]);
  await audit(c, "file.upload", { targetType: "file", targetId: row.id, data: { name: row.name, size: row.size, scan: status } });
  const { storage_path: _sp, ...pub } = row;
  return c.json(pub, 201);
});

content.get("/files", async (c) => {
  const a = need(c, "files:read");
  const f = query(c, listQuery.extend({ q: z.string().max(200).optional() }));
  let q = db.from("files").select("id, name, mime, size, sha256, scan_status, created_by, created_at, file_links(count)")
    .eq("org_id", a.orgId).is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(f.limit + 1);
  if (f.q) q = q.ilike("name", `%${f.q.replace(/[%,()]/g, "")}%`);
  q = applyCursor(q, f.cursor);
  return c.json(page(must(await q, "files") as any[], f.limit));
});

content.get("/files/:id", async (c) => {
  const a = need(c, "files:read");
  const file = must(await db.from("files").select("id, name, mime, size, sha256, scan_status, created_by, created_at").eq("id", c.req.param("id")).eq("org_id", a.orgId).is("deleted_at", null).maybeSingle(), "file");
  if (!file) fail("not_found", "File not found");
  const links = must(await db.from("file_links").select("id, token, message_id, recipient_id, expires_at, revoked_at, view_count, created_at, message_recipients:recipient_id(email)").eq("file_id", c.req.param("id")).order("created_at", { ascending: false }), "links") as any[];
  const views = must(await db.from("events").select("id, type, occurred_at, device, uncertain, recipient_id, message_id").eq("org_id", a.orgId).in("type", ["message.file_viewed", "message.file_downloaded"]).eq("data->>file_id", c.req.param("id")).order("occurred_at", { ascending: false }).limit(100), "views");
  return c.json({ ...(file as object), links: links.map((l) => ({ ...l, url: fileUrl(l.token), token: undefined })), views });
});

content.post("/files/:id/links", async (c) => {
  const a = needWritable(c, "files:write");
  const b = await body(c, z.object({ expires_at: z.string().datetime({ offset: true }).nullish(), allow_download: z.boolean().default(true) }));
  const file = must(await db.from("files").select("id, scan_status").eq("id", c.req.param("id")).eq("org_id", a.orgId).is("deleted_at", null).maybeSingle(), "file") as any;
  if (!file) fail("not_found", "File not found");
  if (file.scan_status === "infected") fail("bad_request", "This file failed the malware scan");
  const l = must(await db.from("file_links").insert({ org_id: a.orgId, file_id: file.id, token: token(24), expires_at: b.expires_at ?? null, allow_download: b.allow_download, created_by: a.userId ?? null }).select("*").single(), "link") as any;
  await audit(c, "file.link_create", { targetType: "file", targetId: file.id });
  return c.json({ id: l.id, url: fileUrl(l.token), expires_at: l.expires_at, allow_download: l.allow_download, created_at: l.created_at }, 201);
});

content.post("/file-links/:id/revoke", async (c) => {
  const a = needWritable(c, "files:write");
  must(await db.from("file_links").update({ revoked_at: new Date().toISOString() }).eq("id", c.req.param("id")).eq("org_id", a.orgId), "revoke");
  await audit(c, "file.link_revoke", { targetType: "file_link", targetId: c.req.param("id") });
  return c.json({ ok: true });
});

content.delete("/files/:id", async (c) => {
  const a = needWritable(c, "files:write");
  const f = must(await db.from("files").select("id, storage_path").eq("id", c.req.param("id")).eq("org_id", a.orgId).is("deleted_at", null).maybeSingle(), "file") as any;
  if (!f) fail("not_found", "File not found");
  await db.from("file_links").update({ revoked_at: new Date().toISOString() }).eq("file_id", f.id).is("revoked_at", null);
  await db.storage.from("secure-files").remove([f.storage_path]);
  await db.from("files").update({ deleted_at: new Date().toISOString() }).eq("id", f.id);
  await audit(c, "file.delete", { targetType: "file", targetId: f.id });
  return c.body(null, 204);
});
