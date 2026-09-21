import { Hono } from "hono";
import { z } from "zod";
import { env, features } from "../../env";
import { db, must } from "../../lib/db";
import { fail } from "../../lib/errors";
import { need, needWritable, type AppEnv } from "../../lib/auth";
import { audit } from "../../lib/audit";
import { body } from "../../lib/http";
import { assertFeature } from "../../lib/plan";
import { authorizeUrl, SCOPES } from "../../providers/oauth";
import { createDomain, deleteDomain, getDomain, verifyDomain } from "../../providers/resend";
import { createCheckout, createPortal } from "../../services/billing";

export const senders = new Hono<AppEnv>();

// ================= Sender identities & domains =================
senders.get("/senders", async (c) => {
  const a = need(c, "messages:read");
  const rows = must(await db.from("sender_identities").select("id, kind, email, name, domain_id, connection_id, created_at, sender_domains(domain, status), provider_connections(status, account_email)").eq("org_id", a.orgId).order("created_at"), "senders");
  return c.json({ data: rows, platform_sender: { email: env.PLATFORM_FROM_EMAIL, description: "Sends as '<Workspace> via SentLedger' with your address as Reply-To. Works immediately, no DNS needed." } });
});

senders.post("/senders", async (c) => {
  const a = needWritable(c, "org:manage");
  const b = await body(c, z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().max(120).nullish() }));
  const domain = b.email.split("@")[1]!;
  const d = must(await db.from("sender_domains").select("id, status").eq("org_id", a.orgId).eq("domain", domain).maybeSingle(), "domain") as any;
  if (!d) fail("bad_request", `Add and verify ${domain} before creating a sender on it`);
  if (d.status !== "verified") fail("bad_request", `${domain} is not verified yet`);
  const row = must(await db.from("sender_identities").insert({ org_id: a.orgId, kind: "managed", email: b.email, name: b.name ?? null, domain_id: d.id }).select("*").single(), "sender");
  await audit(c, "sender.create", { targetType: "sender", targetId: (row as any).id, data: { email: b.email } });
  return c.json(row, 201);
});

senders.delete("/senders/:id", async (c) => {
  const a = needWritable(c, "org:manage");
  await db.from("organizations").update({ default_sender_id: null }).eq("id", a.orgId).eq("default_sender_id", c.req.param("id"));
  await db.from("sender_identities").delete().eq("id", c.req.param("id")).eq("org_id", a.orgId).eq("kind", "managed");
  await audit(c, "sender.delete", { targetType: "sender", targetId: c.req.param("id") });
  return c.body(null, 204);
});

senders.get("/domains", async (c) => {
  const a = need(c, "messages:read");
  return c.json({ data: must(await db.from("sender_domains").select("*").eq("org_id", a.orgId).order("created_at"), "domains") });
});

senders.post("/domains", async (c) => {
  const a = needWritable(c, "org:manage");
  if (!features.email) fail("not_configured", "Custom sending domains become available once email sending is configured");
  const b = await body(c, z.object({ domain: z.string().trim().toLowerCase().regex(/^(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,}$/, "Enter a domain like example.com") }));
  if (b.domain.endsWith(env.PLATFORM_SEND_DOMAIN)) fail("bad_request", "That domain is reserved");
  const exists = must(await db.from("sender_domains").select("id").eq("domain", b.domain).eq("status", "verified").neq("org_id", a.orgId).maybeSingle(), "domain");
  if (exists) fail("conflict", "That domain is verified by another workspace. Contact support if you own it.");
  const r = await createDomain(b.domain).catch((e) => fail("provider_error", (e as Error).message));
  const row = must(await db.from("sender_domains").upsert({ org_id: a.orgId, domain: b.domain, provider_domain_id: r.id, dns_records: dmarcGuidance(b.domain, r.records), status: r.status === "verified" ? "verified" : "pending" }, { onConflict: "org_id,domain" }).select("*").single(), "domain");
  await audit(c, "domain.add", { targetType: "domain", targetId: b.domain });
  return c.json(row, 201);
});

/** Adds a recommended DMARC record to the provider's SPF/DKIM records. */
function dmarcGuidance(domain: string, records: any[]) {
  return [...records, { record: "DMARC", name: `_dmarc.${domain}`, type: "TXT", value: "v=DMARC1; p=none; rua=mailto:dmarc@" + domain, ttl: "Auto", status: "recommended" }];
}

senders.post("/domains/:id/verify", async (c) => {
  const a = needWritable(c, "org:manage");
  const d = must(await db.from("sender_domains").select("*").eq("id", c.req.param("id")).eq("org_id", a.orgId).maybeSingle(), "domain") as any;
  if (!d) fail("not_found", "Domain not found");
  await verifyDomain(d.provider_domain_id).catch(() => undefined);
  const s = await getDomain(d.provider_domain_id).catch((e) => fail("provider_error", (e as Error).message));
  const status = s.status === "verified" ? "verified" : s.status === "failed" ? "failed" : "pending";
  const row = must(await db.from("sender_domains").update({ status, dns_records: dmarcGuidance(d.domain, s.records), verified_at: status === "verified" ? new Date().toISOString() : null, last_checked_at: new Date().toISOString() }).eq("id", d.id).select("*").single(), "domain");
  if (status === "verified" && d.status !== "verified") await audit(c, "domain.verified", { targetType: "domain", targetId: d.domain });
  return c.json(row);
});

senders.delete("/domains/:id", async (c) => {
  const a = needWritable(c, "org:manage");
  const d = must(await db.from("sender_domains").select("*").eq("id", c.req.param("id")).eq("org_id", a.orgId).maybeSingle(), "domain") as any;
  if (!d) fail("not_found", "Domain not found");
  if (d.provider_domain_id) await deleteDomain(d.provider_domain_id).catch(() => undefined);
  await db.from("sender_domains").delete().eq("id", d.id);
  await audit(c, "domain.remove", { targetType: "domain", targetId: d.domain });
  return c.body(null, 204);
});

// ================= Connected inboxes =================
senders.get("/integrations", async (c) => {
  const a = need(c, "messages:read");
  const rows = must(await db.from("provider_connections").select("id, provider, account_email, scopes, status, last_error, last_used_at, last_sync_at, created_at, user_id").eq("org_id", a.orgId).order("created_at"), "connections");
  return c.json({
    data: rows,
    available: {
      gmail: { configured: features.gmail, scopes: SCOPES.gmail, tracking: "Opens, clicks and secure-file views are tracked. Gmail does not report delivery or bounce events to SentLedger; bounces arrive in the sender's inbox." },
      microsoft: { configured: features.microsoft, scopes: SCOPES.microsoft, tracking: "Opens, clicks and secure-file views are tracked. Microsoft Graph does not return a message ID or delivery/bounce events; bounces arrive in the sender's mailbox." },
      managed: { configured: features.email, tracking: "Opens, clicks, secure-file views, provider acceptance, delivery, bounces and complaints are tracked." },
    },
  });
});

senders.post("/integrations/:provider/connect", async (c) => {
  const a = needWritable(c, "integrations:manage");
  const p = z.enum(["gmail", "microsoft"]).parse(c.req.param("provider"));
  if (a.kind !== "user") fail("forbidden", "Connecting an inbox requires a signed-in user");
  const { count } = await db.from("provider_connections").select("id", { count: "exact", head: true }).eq("org_id", a.orgId).neq("status", "disconnected");
  await assertFeature(a.orgId, "connected_inboxes", count ?? 0);
  return c.json({ url: authorizeUrl(p, a.orgId, a.userId!) });
});

senders.delete("/integrations/:id", async (c) => {
  const a = needWritable(c, "integrations:manage");
  const conn = must(await db.from("provider_connections").select("id, user_id, provider, account_email").eq("id", c.req.param("id")).eq("org_id", a.orgId).maybeSingle(), "connection") as any;
  if (!conn) fail("not_found", "Connection not found");
  if (conn.user_id !== a.userId && a.role !== "owner" && a.role !== "admin") fail("forbidden", "Only the person who connected this inbox or an admin can disconnect it");
  await db.from("provider_connections").update({ status: "disconnected", access_token_enc: null, refresh_token_enc: null }).eq("id", conn.id);
  await db.from("sender_identities").delete().eq("connection_id", conn.id);
  await audit(c, "integration.disconnect", { targetType: "connection", targetId: conn.id, data: { provider: conn.provider, account: conn.account_email } });
  return c.body(null, 204);
});

// ================= Billing =================
export const plans = new Hono<AppEnv>();
plans.get("/plans", async (c) => {
  const rows = must(await db.from("plans").select("id, name, description, price_monthly_cents, price_annual_cents, entitlements, stripe_price_monthly, stripe_price_annual, sort").eq("is_public", true).order("sort"), "plans") as any[];
  return c.json({ data: rows.map(({ stripe_price_monthly, stripe_price_annual, ...p }) => ({ ...p, purchasable: { month: Boolean(stripe_price_monthly), year: Boolean(stripe_price_annual) } })), billing_enabled: features.stripe });
});

senders.get("/billing", async (c) => {
  const a = need(c, "billing:read");
  const [sub, invoices, events] = await Promise.all([
    db.from("subscriptions").select("plan_id, status, billing_interval, trial_ends_at, current_period_end, cancel_at_period_end, stripe_customer_id, updated_at").eq("org_id", a.orgId).maybeSingle(),
    db.from("invoices").select("*").eq("org_id", a.orgId).order("created_at", { ascending: false }).limit(50),
    db.from("billing_events").select("id, type, summary, created_at").eq("org_id", a.orgId).order("created_at", { ascending: false }).limit(50),
  ]);
  const s = must(sub, "sub") as any;
  return c.json({ subscription: s ? { ...s, has_billing_account: Boolean(s.stripe_customer_id), stripe_customer_id: undefined } : null, invoices: must(invoices, "invoices"), history: must(events, "events"), billing_enabled: features.stripe });
});

senders.post("/billing/checkout", async (c) => {
  const a = needWritable(c, "billing:manage");
  const b = await body(c, z.object({ plan_id: z.string(), interval: z.enum(["month", "year"]) }));
  const url = await createCheckout(a.orgId, b.plan_id, b.interval, a.email ?? "");
  await audit(c, "billing.checkout_started", { data: b });
  return c.json({ url });
});

senders.post("/billing/portal", async (c) => {
  const a = need(c, "billing:manage");
  const url = await createPortal(a.orgId);
  await audit(c, "billing.portal_opened");
  return c.json({ url });
});
