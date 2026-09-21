import { Hono } from "hono";
import { z } from "zod";
import { db, must } from "../../lib/db";
import { fail } from "../../lib/errors";
import { need, requireUser, requirePlatformAdmin, type AppEnv } from "../../lib/auth";
import { audit } from "../../lib/audit";
import { body, query } from "../../lib/http";
import { ipLimit } from "../../lib/ratelimit";
import { env, features } from "../../env";

export const analytics = new Hono<AppEnv>();

analytics.get("/analytics", async (c) => {
  const a = need(c, "messages:read");
  const f = query(c, z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() }));
  const to = f.to ? new Date(f.to) : new Date();
  const from = f.from ? new Date(f.from) : new Date(to.getTime() - 29 * 86_400_000);
  if (to.getTime() - from.getTime() > 400 * 86_400_000) fail("bad_request", "Date range can be at most 400 days");
  const summary = must(await db.rpc("analytics_summary", { p_org: a.orgId, p_from: from.toISOString(), p_to: to.toISOString() }), "analytics");
  const recent = must(await db.from("events").select("id, type, occurred_at, uncertain, is_proxy, message_id, data, message_recipients(email), messages(subject)")
    .eq("org_id", a.orgId).eq("is_duplicate", false).in("type", ["message.sent", "message.delivered", "message.opened", "message.clicked", "message.file_viewed", "message.bounced", "message.failed"])
    .order("occurred_at", { ascending: false }).limit(15), "recent");
  return c.json({ from: from.toISOString(), to: to.toISOString(), ...(summary as object), recent });
});

// ================= Platform admin =================
export const admin = new Hono<AppEnv>();
admin.use("*", requireUser, requirePlatformAdmin);

admin.get("/overview", async (c) => {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [orgs, subs, sends, dead, abuse, queued] = await Promise.all([
    db.from("organizations").select("id", { count: "exact", head: true }).is("deleted_at", null),
    db.from("subscriptions").select("status, plan_id"),
    db.from("events").select("id", { count: "exact", head: true }).eq("type", "message.sent").gte("occurred_at", since),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("status", "dead"),
    db.from("abuse_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("status", "queued"),
  ]);
  const byStatus: Record<string, number> = {};
  for (const s of (subs.data ?? []) as any[]) byStatus[`${s.plan_id}:${s.status}`] = (byStatus[`${s.plan_id}:${s.status}`] ?? 0) + 1;
  return c.json({
    organizations: orgs.count ?? 0, subscriptions: byStatus, sends_24h: sends.count ?? 0, dead_jobs: dead.count ?? 0,
    open_abuse_reports: abuse.count ?? 0, queued_jobs: queued.count ?? 0, providers: features,
  });
});

admin.get("/organizations", async (c) => {
  const q = c.req.query("q")?.replace(/[%,()]/g, "");
  let r = db.from("organizations").select("id, name, status, suspended_reason, created_at, deleted_at, subscriptions(plan_id, status, trial_ends_at), usage_counters(period, sends)").order("created_at", { ascending: false }).limit(100);
  if (q) r = r.ilike("name", `%${q}%`);
  return c.json({ data: must(await r, "orgs") });
});

admin.post("/organizations/:id/suspend", async (c) => {
  const b = await body(c, z.object({ suspended: z.boolean(), reason: z.string().max(500).optional() }));
  await db.from("organizations").update({ status: b.suspended ? "suspended" : "active", suspended_reason: b.suspended ? b.reason ?? null : null }).eq("id", c.req.param("id"));
  await audit(c, b.suspended ? "platform.org_suspended" : "platform.org_unsuspended", { orgId: c.req.param("id"), targetType: "organization", targetId: c.req.param("id"), data: { reason: b.reason } });
  return c.json({ ok: true });
});

admin.get("/jobs", async (c) => {
  const rows = must(await db.from("jobs").select("id, type, status, attempts, max_attempts, last_error, run_at, created_at, updated_at").in("status", ["dead", "failed", "queued", "running"]).order("updated_at", { ascending: false }).limit(100), "jobs");
  return c.json({ data: rows });
});

admin.post("/jobs/:id/retry", async (c) => {
  await db.from("jobs").update({ status: "queued", run_at: new Date().toISOString(), attempts: 0 }).eq("id", c.req.param("id"));
  await audit(c, "platform.job_retry", { targetType: "job", targetId: c.req.param("id") });
  return c.json({ ok: true });
});

admin.get("/abuse-reports", async (c) => {
  return c.json({ data: must(await db.from("abuse_reports").select("*, organizations(name)").order("created_at", { ascending: false }).limit(100), "reports") });
});

admin.patch("/abuse-reports/:id", async (c) => {
  const b = await body(c, z.object({ status: z.enum(["open", "reviewing", "actioned", "dismissed"]) }));
  await db.from("abuse_reports").update({ status: b.status }).eq("id", c.req.param("id"));
  return c.json({ ok: true });
});

/** Support-safe lookup: returns account metadata only, never message content. */
admin.get("/users", async (c) => {
  const email = z.string().min(3).parse(c.req.query("email")).toLowerCase();
  const rows = must(await db.from("profiles").select("id, email, full_name, created_at, memberships(role, organizations(id, name, status))").ilike("email", `%${email.replace(/[%,()]/g, "")}%`).limit(20), "users");
  await audit(c, "platform.user_lookup", { data: { query: email } });
  return c.json({ data: rows });
});

admin.get("/contact-requests", async (c) => {
  return c.json({ data: must(await db.from("contact_requests").select("*").order("created_at", { ascending: false }).limit(100), "requests") });
});

// ================= Public forms =================
export const publicForms = new Hono<AppEnv>();

/** Public client configuration (Supabase URL + anon key are publishable by design). */
publicForms.get("/config", (c) => {
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ supabaseUrl: env.SUPABASE_URL, supabaseAnonKey: env.SUPABASE_ANON_KEY, publicUrl: env.PUBLIC_URL, features });
});

publicForms.post("/contact", ipLimit("contact", 5, 10 * 60_000), async (c) => {
  const b = await body(c, z.object({
    name: z.string().trim().min(1).max(120), email: z.string().trim().email(), company: z.string().max(200).optional(),
    topic: z.enum(["sales", "support", "enterprise", "partnership", "other"]).default("sales"), message: z.string().trim().min(5).max(5000),
    website: z.string().max(0).optional(), // honeypot
  }));
  await db.from("contact_requests").insert({ name: b.name, email: b.email, company: b.company ?? null, topic: b.topic, message: b.message });
  return c.json({ ok: true }, 201);
});

publicForms.post("/abuse", ipLimit("abuse", 5, 10 * 60_000), async (c) => {
  const b = await body(c, z.object({
    reporter_email: z.string().email().optional(), reason: z.enum(["spam", "phishing", "harassment", "malware", "privacy", "other"]),
    details: z.string().trim().min(5).max(5000), message_reference: z.string().max(200).optional(), website: z.string().max(0).optional(),
  }));
  let orgId: string | null = null;
  let messageId: string | null = null;
  if (b.message_reference && /^[0-9a-f-]{36}$/.test(b.message_reference)) {
    const m = (await db.from("messages").select("id, org_id").eq("id", b.message_reference).maybeSingle()).data;
    if (m) { orgId = m.org_id; messageId = m.id; }
  }
  await db.from("abuse_reports").insert({ org_id: orgId, message_id: messageId, reporter_email: b.reporter_email ?? null, reason: b.reason, details: b.details });
  return c.json({ ok: true }, 201);
});
