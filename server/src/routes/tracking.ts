import { Hono, type Context } from "hono";
import { db } from "../lib/db";
import { trackSig, safeEqual } from "../lib/crypto";
import { log } from "../lib/log";
import { clientIp, type AppEnv } from "../lib/auth";
import { recordEvent } from "../services/events";
import { assess, hashIp, truncateIp } from "../services/privacy";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const noStore = { "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0", Pragma: "no-cache", Expires: "0" };

type Target = { orgId: string; messageId: string; recipientId: string | null; message: any };

/** Resolves a per-recipient token or a group-send token. */
async function resolve(token: string): Promise<Target | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const r = await db.from("message_recipients").select("id, org_id, message_id, messages(id, org_id, sent_at, tracking, links, revoked_at, expires_at, deleted_at)").eq("token", token).maybeSingle();
  if (r.data) return { orgId: r.data.org_id, messageId: r.data.message_id, recipientId: r.data.id, message: r.data.messages };
  const m = await db.from("messages").select("id, org_id, sent_at, tracking, links, revoked_at, expires_at, deleted_at").eq("group_token", token).maybeSingle();
  if (m.data) return { orgId: m.data.org_id, messageId: m.data.id, recipientId: null, message: m.data };
  return null;
}

async function isDuplicate(t: Target, type: string, ipHash: string | null, ua: string | undefined, windowSec: number, extra?: (q: any) => any) {
  let q = db.from("events").select("id", { count: "exact", head: true })
    .eq("message_id", t.messageId).eq("type", type).gte("occurred_at", new Date(Date.now() - windowSec * 1000).toISOString());
  q = t.recipientId ? q.eq("recipient_id", t.recipientId) : q.is("recipient_id", null);
  if (ipHash) q = q.eq("ip_hash", ipHash);
  if (ua) q = q.eq("user_agent", ua.slice(0, 400));
  if (extra) q = extra(q);
  const { count } = await q;
  return (count ?? 0) > 0;
}

function trackingContext(c: Context, kind: "open" | "click" | "file", t: Target) {
  const ip = clientIp(c);
  const ua = c.req.header("user-agent");
  const a = assess(kind, ua, ip, t.message.sent_at);
  return { ip, ua, a, ipHash: hashIp(ip), ipTruncated: truncateIp(ip) };
}

export function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title} · SentLedger</title><style>
:root{color-scheme:light dark;--bg:#f6f7f5;--card:#fff;--fg:#111827;--muted:#6b7280;--line:#e5e7eb;--accent:#0f5c4d}
@media (prefers-color-scheme:dark){:root{--bg:#0b0f0e;--card:#141a18;--fg:#eef2f0;--muted:#9aa5a1;--line:#26302d;--accent:#5fc7ad}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px;max-width:440px;width:100%}
h1{font-size:20px;margin:0 0 8px}p{color:var(--muted);margin:0 0 16px}.btn{display:inline-block;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:600;text-decoration:none;cursor:pointer;font-size:15px}
.meta{font-size:13px;color:var(--muted);border-top:1px solid var(--line);margin-top:20px;padding-top:12px}.brand{font-weight:700;letter-spacing:-.01em;margin-bottom:16px;color:var(--accent)}
</style></head><body><main class="card"><div class="brand">SentLedger</div>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...noStore, "X-Robots-Tag": "noindex" } });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export const tracking = new Hono<AppEnv>();

// ---- Open pixel ----
tracking.get("/t/o/:file", async (c) => {
  const token = c.req.param("file").replace(/\.gif$/, "");
  const sig = c.req.query("s") ?? "";
  const respond = () => new Response(GIF, { headers: { "Content-Type": "image/gif", "Content-Length": String(GIF.length), ...noStore } });
  try {
    if (!safeEqual(sig, trackSig(`o:${token}`))) return respond();
    const t = await resolve(token);
    if (!t || !t.message?.tracking?.open || t.message.deleted_at) return respond();
    const x = trackingContext(c, "open", t);
    const dup = await isDuplicate(t, "message.opened", x.ipHash, x.ua, 60);
    await recordEvent({
      orgId: t.orgId, messageId: t.messageId, recipientId: t.recipientId, type: "message.opened", source: "tracking",
      ipTruncated: x.ipTruncated, ipHash: x.ipHash, userAgent: x.ua, device: x.a.device, isProxy: x.a.isProxy,
      uncertain: x.a.uncertain, isDuplicate: dup, data: { reasons: x.a.reasons, attribution: t.recipientId ? "recipient" : "group" },
    });
    if (!dup && t.recipientId) await db.rpc("bump_recipient", { p_id: t.recipientId, p_field: "open", p_at: new Date().toISOString() });
  } catch (e) {
    log.error("open tracking failed", { err: e });
  }
  return respond();
});

// ---- Click redirect (destination comes from the frozen message, never from the URL: no open redirect) ----
tracking.get("/t/c/:token/:i", async (c) => {
  const token = c.req.param("token");
  const i = Number(c.req.param("i"));
  if (!Number.isInteger(i) || !safeEqual(c.req.query("s") ?? "", trackSig(`c:${token}:${i}`))) return page("Link not found", "<h1>Link not found</h1><p>This tracked link is invalid.</p>", 404);
  const t = await resolve(token);
  const link = t?.message?.links?.find((l: any) => l.i === i);
  if (!t || !link) return page("Link not found", "<h1>Link not found</h1><p>This link is no longer available.</p>", 404);
  if (t.message.revoked_at) return page("Link revoked", "<h1>This link was revoked</h1><p>The sender has withdrawn access to the content of this message.</p>", 410);
  try {
    const x = trackingContext(c, "click", t);
    const dup = await isDuplicate(t, "message.clicked", x.ipHash, x.ua, 30, (q) => q.eq("data->>link_index", String(i)));
    await recordEvent({
      orgId: t.orgId, messageId: t.messageId, recipientId: t.recipientId, type: "message.clicked", source: "tracking",
      ipTruncated: x.ipTruncated, ipHash: x.ipHash, userAgent: x.ua, device: x.a.device, isProxy: x.a.isProxy,
      uncertain: x.a.uncertain, isDuplicate: dup, data: { link_index: i, url: link.url, reasons: x.a.reasons },
    });
    if (!dup && t.recipientId) await db.rpc("bump_recipient", { p_id: t.recipientId, p_field: "click", p_at: new Date().toISOString() });
  } catch (e) {
    log.error("click tracking failed", { err: e });
  }
  return new Response(null, { status: 302, headers: { Location: link.url, ...noStore, "Referrer-Policy": "no-referrer" } });
});

// ---- Secure hosted file view ----
async function fileLink(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const r = await db.from("file_links").select("*, files(id, name, mime, size, storage_path, deleted_at, scan_status), organizations(name)").eq("token", token).maybeSingle();
  return r.data as any;
}

function fileUnavailable(l: any) {
  if (!l || !l.files || l.files.deleted_at) return page("File unavailable", "<h1>File unavailable</h1><p>This file link is not valid.</p>", 404);
  if (l.revoked_at) return page("Access revoked", "<h1>Access revoked</h1><p>The sender has revoked access to this file.</p>", 410);
  if (l.expires_at && new Date(l.expires_at) < new Date()) return page("Link expired", "<h1>This link has expired</h1><p>Ask the sender for a new link if you still need the file.</p>", 410);
  if (l.files.scan_status === "infected") return page("File blocked", "<h1>File blocked</h1><p>This file failed a security scan and cannot be opened.</p>", 403);
  return null;
}

async function recordFile(c: Context, l: any, type: "message.file_viewed" | "message.file_downloaded") {
  if (!l.message_id) return;
  const msg = (await db.from("messages").select("sent_at").eq("id", l.message_id).single()).data;
  const t: Target = { orgId: l.org_id, messageId: l.message_id, recipientId: l.recipient_id, message: msg ?? {} };
  const x = trackingContext(c, "file", t);
  const dup = await isDuplicate(t, type, x.ipHash, x.ua, 60, (q) => q.eq("data->>file_id", l.file_id));
  await recordEvent({
    orgId: l.org_id, messageId: l.message_id, recipientId: l.recipient_id, type, source: "tracking",
    ipTruncated: x.ipTruncated, ipHash: x.ipHash, userAgent: x.ua, device: x.a.device, isProxy: x.a.isProxy, uncertain: x.a.uncertain,
    isDuplicate: dup, data: { file_id: l.file_id, file_name: l.files.name, reasons: x.a.reasons },
  });
  if (!dup && l.recipient_id && type === "message.file_viewed") await db.rpc("bump_recipient", { p_id: l.recipient_id, p_field: "file", p_at: new Date().toISOString() });
}

tracking.get("/f/:token", async (c) => {
  const l = await fileLink(c.req.param("token"));
  const bad = fileUnavailable(l);
  if (bad) return bad;
  await db.from("file_links").update({ view_count: l.view_count + 1 }).eq("id", l.id);
  try { await recordFile(c, l, "message.file_viewed"); } catch (e) { log.error("file view tracking failed", { err: e }); }
  const size = l.files.size > 1e6 ? `${(l.files.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(l.files.size / 1e3))} KB`;
  return page(esc(l.files.name), `<h1>${esc(l.files.name)}</h1><p>Shared securely by <strong>${esc(l.organizations?.name ?? "the sender")}</strong> · ${size}</p>
    <a class="btn" href="/f/${c.req.param("token")}/open" rel="noopener">Open file</a>
    <div class="meta">Access to this file is logged for the sender's records (time, device type and approximate network). ${l.expires_at ? `This link expires ${new Date(l.expires_at).toUTCString()}.` : ""}</div>`);
});

tracking.get("/f/:token/open", async (c) => {
  const l = await fileLink(c.req.param("token"));
  const bad = fileUnavailable(l);
  if (bad) return bad;
  try { await recordFile(c, l, "message.file_downloaded"); } catch (e) { log.error("file download tracking failed", { err: e }); }
  const signed = await db.storage.from("secure-files").createSignedUrl(l.files.storage_path, 60, l.allow_download ? { download: l.files.name } : undefined);
  if (signed.error || !signed.data) return page("File unavailable", "<h1>File unavailable</h1><p>Please try again in a moment.</p>", 503);
  return new Response(null, { status: 302, headers: { Location: signed.data.signedUrl, ...noStore, "Referrer-Policy": "no-referrer" } });
});

// ---- Unsubscribe (GET confirms, POST applies; supports RFC 8058 one-click) ----
async function unsubscribe(c: Context, token: string) {
  const r = (await db.from("message_recipients").select("id, org_id, message_id, email").eq("token", token).maybeSingle()).data;
  if (!r) return false;
  await db.from("suppressions").upsert({ org_id: r.org_id, email: r.email, reason: "unsubscribe", source_message_id: r.message_id }, { onConflict: "org_id,email", ignoreDuplicates: true });
  await recordEvent({ orgId: r.org_id, messageId: r.message_id, recipientId: r.id, type: "message.unsubscribed", source: "tracking", data: { email: r.email } });
  return true;
}

tracking.get("/u/:token", async (c) => {
  const token = c.req.param("token");
  const s = c.req.query("s") ?? "";
  if (!safeEqual(s, trackSig(`u:${token}`))) return page("Invalid link", "<h1>Invalid link</h1><p>This unsubscribe link is not valid.</p>", 404);
  return page("Unsubscribe", `<h1>Unsubscribe</h1><p>Stop receiving messages from this sender through SentLedger?</p>
    <form method="post" action="/u/${esc(token)}?s=${esc(s)}"><button class="btn" type="submit">Unsubscribe</button></form>`);
});

tracking.post("/u/:token", async (c) => {
  const token = c.req.param("token");
  if (!safeEqual(c.req.query("s") ?? "", trackSig(`u:${token}`))) return page("Invalid link", "<h1>Invalid link</h1>", 404);
  const ok = await unsubscribe(c, token);
  return page("Unsubscribed", ok ? "<h1>You're unsubscribed</h1><p>You won't receive further messages from this sender through SentLedger.</p>" : "<h1>Link not found</h1>", ok ? 200 : 404);
});
