import { Hono } from "hono";
import { z } from "zod";
import { env } from "../../env";
import { db, must } from "../../lib/db";
import { fail } from "../../lib/errors";
import { sha256, token } from "../../lib/crypto";
import { API_SCOPES, need, needWritable, requireUser, actorForUser, type AppEnv, type Actor } from "../../lib/auth";
import { audit } from "../../lib/audit";
import { applyCursor, body, listQuery, page, query } from "../../lib/http";
import { assertFeature } from "../../lib/plan";
import { ipLimit } from "../../lib/ratelimit";
import { WEBHOOK_EVENTS, WEBHOOK_SCHEMA_VERSION, queueWebhook } from "../../services/events";
import { enqueue } from "../../services/jobs";
import { isSafeWebhookUrl, newWebhookSecret, sealSecret } from "../../services/webhooks";
import { decrypt } from "../../lib/crypto";

export const developer = new Hono<AppEnv>();

// ================= API keys =================
export async function mintApiKey(a: Pick<Actor, "orgId" | "userId">, name: string, scopes: string[], expiresAt?: string | null, ipAllowlist: string[] = []) {
  const prefix = token(6).replace(/[-_]/g, "x").slice(0, 8);
  const secret = `sl_live_${prefix}_${token(24)}`;
  const row = must(await db.from("api_keys").insert({
    org_id: a.orgId, name, prefix: `sl_live_${prefix}`, key_hash: sha256(secret), scopes, expires_at: expiresAt ?? null,
    ip_allowlist: ipAllowlist, created_by: a.userId ?? null,
  }).select("id, name, prefix, scopes, expires_at, ip_allowlist, created_at").single(), "api key") as any;
  return { ...row, secret };
}

developer.get("/api-keys", async (c) => {
  const a = need(c, "apikeys:manage");
  const rows = must(await db.from("api_keys").select("id, name, prefix, scopes, ip_allowlist, expires_at, revoked_at, last_used_at, created_by, created_at").eq("org_id", a.orgId).order("created_at", { ascending: false }), "keys");
  return c.json({ data: rows, available_scopes: API_SCOPES });
});

developer.post("/api-keys", async (c) => {
  const a = needWritable(c, "apikeys:manage");
  await assertFeature(a.orgId, "api_access");
  const b = await body(c, z.object({
    name: z.string().trim().min(1).max(80),
    scopes: z.array(z.enum(API_SCOPES)).min(1),
    expires_at: z.string().datetime({ offset: true }).nullish(),
    ip_allowlist: z.array(z.union([z.ipv4(), z.ipv6()])).max(20).default([]),
  }));
  const key = await mintApiKey(a, b.name, b.scopes, b.expires_at, b.ip_allowlist);
  await audit(c, "api_key.create", { targetType: "api_key", targetId: key.id, data: { name: b.name, scopes: b.scopes } });
  return c.json(key, 201); // secret is returned exactly once
});

developer.post("/api-keys/:id/revoke", async (c) => {
  const a = needWritable(c, "apikeys:manage");
  must(await db.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", c.req.param("id")).eq("org_id", a.orgId).is("revoked_at", null), "revoke");
  await audit(c, "api_key.revoke", { targetType: "api_key", targetId: c.req.param("id") });
  return c.json({ ok: true });
});

// ================= Webhooks =================
const WebhookInput = z.object({
  url: z.string().url().max(500).refine(isSafeWebhookUrl, "Webhook URL must be a public https:// address"),
  description: z.string().max(200).nullish(),
  events: z.array(z.enum([...WEBHOOK_EVENTS, "*"] as [string, ...string[]])).min(1),
  enabled: z.boolean().default(true),
});

developer.get("/webhooks", async (c) => {
  const a = need(c, "webhooks:manage");
  const rows = must(await db.from("webhook_endpoints").select("id, url, description, events, enabled, created_at").eq("org_id", a.orgId).order("created_at", { ascending: false }), "webhooks");
  return c.json({ data: rows, available_events: WEBHOOK_EVENTS, schema_version: WEBHOOK_SCHEMA_VERSION });
});

developer.post("/webhooks", async (c) => {
  const a = needWritable(c, "webhooks:manage");
  const b = await body(c, WebhookInput);
  const { count } = await db.from("webhook_endpoints").select("id", { count: "exact", head: true }).eq("org_id", a.orgId);
  await assertFeature(a.orgId, "webhooks", count ?? 0);
  const secret = newWebhookSecret();
  const row = must(await db.from("webhook_endpoints").insert({ org_id: a.orgId, url: b.url, description: b.description ?? null, events: b.events, enabled: b.enabled, secret_enc: sealSecret(secret), created_by: a.userId ?? null })
    .select("id, url, description, events, enabled, created_at").single(), "webhook") as any;
  await audit(c, "webhook.create", { targetType: "webhook", targetId: row.id, data: { url: b.url, events: b.events } });
  return c.json({ ...row, secret }, 201);
});

developer.get("/webhooks/:id", async (c) => {
  const a = need(c, "webhooks:manage");
  const row = must(await db.from("webhook_endpoints").select("id, url, description, events, enabled, created_at, secret_enc").eq("id", c.req.param("id")).eq("org_id", a.orgId).maybeSingle(), "webhook") as any;
  if (!row) fail("not_found", "Webhook not found");
  const { secret_enc, ...rest } = row;
  const reveal = c.req.query("reveal_secret") === "true" && a.kind === "user";
  if (reveal) await audit(c, "webhook.secret_revealed", { targetType: "webhook", targetId: row.id });
  return c.json({ ...rest, secret: reveal ? decrypt(secret_enc) : undefined });
});

developer.patch("/webhooks/:id", async (c) => {
  const a = needWritable(c, "webhooks:manage");
  const b = await body(c, WebhookInput.partial());
  const row = must(await db.from("webhook_endpoints").update(b).eq("id", c.req.param("id")).eq("org_id", a.orgId).select("id, url, description, events, enabled, created_at").maybeSingle(), "webhook");
  if (!row) fail("not_found", "Webhook not found");
  await audit(c, "webhook.update", { targetType: "webhook", targetId: c.req.param("id"), data: b });
  return c.json(row);
});

developer.post("/webhooks/:id/rotate-secret", async (c) => {
  const a = needWritable(c, "webhooks:manage");
  const secret = newWebhookSecret();
  const row = must(await db.from("webhook_endpoints").update({ secret_enc: sealSecret(secret) }).eq("id", c.req.param("id")).eq("org_id", a.orgId).select("id").maybeSingle(), "webhook");
  if (!row) fail("not_found", "Webhook not found");
  await audit(c, "webhook.rotate_secret", { targetType: "webhook", targetId: c.req.param("id") });
  return c.json({ secret });
});

developer.delete("/webhooks/:id", async (c) => {
  const a = needWritable(c, "webhooks:manage");
  await db.from("webhook_endpoints").delete().eq("id", c.req.param("id")).eq("org_id", a.orgId);
  await audit(c, "webhook.delete", { targetType: "webhook", targetId: c.req.param("id") });
  return c.body(null, 204);
});

developer.post("/webhooks/:id/test", async (c) => {
  const a = needWritable(c, "webhooks:manage");
  const ep = must(await db.from("webhook_endpoints").select("id").eq("id", c.req.param("id")).eq("org_id", a.orgId).maybeSingle(), "webhook");
  if (!ep) fail("not_found", "Webhook not found");
  const id = `evt_test_${token(10)}`;
  await queueWebhook(a.orgId, [c.req.param("id")], {
    id, type: "webhook.test", created_at: new Date().toISOString(), schema_version: WEBHOOK_SCHEMA_VERSION, organization_id: a.orgId,
    data: { message: "This is a test event from SentLedger. Verify the SentLedger-Signature header with your endpoint secret." },
  });
  return c.json({ queued: true, event_id: id }, 202);
});

developer.get("/webhooks/:id/deliveries", async (c) => {
  const a = need(c, "webhooks:manage");
  const f = query(c, listQuery.extend({ status: z.string().optional() }));
  let q = db.from("webhook_deliveries").select("id, event_id, event_type, status, attempts, last_status_code, last_error, next_attempt_at, created_at, updated_at")
    .eq("org_id", a.orgId).eq("endpoint_id", c.req.param("id")).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(f.limit + 1);
  if (f.status) q = q.eq("status", f.status);
  q = applyCursor(q, f.cursor);
  return c.json(page(must(await q, "deliveries") as any[], f.limit));
});

developer.get("/webhook-deliveries/:id", async (c) => {
  const a = need(c, "webhooks:manage");
  const d = must(await db.from("webhook_deliveries").select("*").eq("id", c.req.param("id")).eq("org_id", a.orgId).maybeSingle(), "delivery");
  if (!d) fail("not_found", "Delivery not found");
  const attempts = must(await db.from("webhook_attempts").select("*").eq("delivery_id", c.req.param("id")).order("attempted_at", { ascending: false }), "attempts");
  return c.json({ ...(d as object), attempts });
});

developer.post("/webhook-deliveries/:id/replay", async (c) => {
  const a = needWritable(c, "webhooks:manage");
  const d = must(await db.from("webhook_deliveries").select("id").eq("id", c.req.param("id")).eq("org_id", a.orgId).maybeSingle(), "delivery");
  if (!d) fail("not_found", "Delivery not found");
  await db.from("webhook_deliveries").update({ status: "pending", next_attempt_at: new Date().toISOString() }).eq("id", c.req.param("id"));
  await enqueue("deliver_webhook", { delivery_id: c.req.param("id") }, { maxAttempts: 1 });
  await audit(c, "webhook.replay", { targetType: "webhook_delivery", targetId: c.req.param("id") });
  return c.json({ queued: true }, 202);
});

// ================= Extension device authorization (RFC 8628 style) =================
export const device = new Hono<AppEnv>();
const EXT_SCOPES = ["messages:write", "messages:read", "events:read", "templates:read", "contacts:read", "files:write"];

device.post("/device/code", ipLimit("device", 10, 60_000), async (c) => {
  const b = await body(c, z.object({ client_name: z.string().trim().min(1).max(60) }));
  const deviceCode = token(32);
  const alphabet = "BCDFGHJKLMNPQRSTVWXZ";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const userCode = Array.from(bytes, (x) => alphabet[x % alphabet.length]).join("").replace(/(.{4})/, "$1-");
  await db.from("device_authorizations").insert({ device_code_hash: sha256(deviceCode), user_code: userCode, client_name: b.client_name });
  return c.json({
    device_code: deviceCode, user_code: userCode, verification_uri: `${env.PUBLIC_URL}/app/device`,
    verification_uri_complete: `${env.PUBLIC_URL}/app/device?code=${userCode}`, expires_in: 600, interval: 5,
  });
});

device.post("/device/token", ipLimit("device-token", 30, 60_000), async (c) => {
  const b = await body(c, z.object({ device_code: z.string().min(20) }));
  const d = must(await db.from("device_authorizations").select("*").eq("device_code_hash", sha256(b.device_code)).maybeSingle(), "device") as any;
  if (!d) return c.json({ error: "invalid_grant" }, 400);
  if (new Date(d.expires_at) < new Date()) return c.json({ error: "expired_token" }, 400);
  if (d.status === "pending") return c.json({ error: "authorization_pending" }, 400);
  if (d.status === "denied") return c.json({ error: "access_denied" }, 400);
  if (d.status === "consumed") return c.json({ error: "invalid_grant" }, 400);
  const key = await mintApiKey({ orgId: d.org_id, userId: d.user_id }, `${d.client_name} (extension)`, EXT_SCOPES);
  await db.from("device_authorizations").update({ status: "consumed", api_key_id: key.id }).eq("id", d.id);
  await db.from("audit_logs").insert({ org_id: d.org_id, actor_user_id: d.user_id, action: "api_key.create", target_type: "api_key", target_id: key.id, data: { via: "device_flow", client: d.client_name } });
  return c.json({ access_token: key.secret, token_type: "Bearer", scope: EXT_SCOPES.join(" "), organization_id: d.org_id });
});

device.post("/device/approve", requireUser, async (c) => {
  const u = c.get("user")!;
  const b = await body(c, z.object({ user_code: z.string().trim().toUpperCase(), org_id: z.string().uuid(), approve: z.boolean() }));
  const a = await actorForUser(u, b.org_id);
  if (!a.scopes.has("messages:write")) fail("forbidden", "Your role can't connect extensions");
  const d = must(await db.from("device_authorizations").select("*").eq("user_code", b.user_code).eq("status", "pending").gt("expires_at", new Date().toISOString()).maybeSingle(), "device") as any;
  if (!d) fail("not_found", "That code is invalid or expired");
  await db.from("device_authorizations").update({ status: b.approve ? "approved" : "denied", org_id: b.org_id, user_id: u.id }).eq("id", d.id);
  return c.json({ ok: true, client_name: d.client_name });
});
