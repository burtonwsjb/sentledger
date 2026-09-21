import { Hono } from "hono";
import { z } from "zod";
import { env, features } from "../../env";
import { db, must } from "../../lib/db";
import { fail } from "../../lib/errors";
import { sha256, token } from "../../lib/crypto";
import { actorForUser, need, needWritable, requireUser, type AppEnv, type Role } from "../../lib/auth";
import { audit } from "../../lib/audit";
import { body, listQuery, page, applyCursor, query } from "../../lib/http";
import { planState, usage, assertFeature } from "../../lib/plan";
import { startTrial } from "../../services/billing";
import { sendPlatformEmail } from "../../services/notify";

export const workspace = new Hono<AppEnv>();

// ---------------- Session-only (no org context) ----------------
export const account = new Hono<AppEnv>();
// requireUser is applied per route: a use("*") here would leak onto every /v1 route.

account.get("/me", requireUser, async (c) => {
  const u = c.get("user")!;
  const profile = must(await db.from("profiles").select("*").eq("id", u.id).single(), "profile");
  const orgs = must(await db.from("memberships").select("role, organizations(id, name, logo_url, status, deleted_at)").eq("user_id", u.id), "orgs") as any[];
  const invites = must(await db.from("invitations").select("id, role, organizations(name)").eq("email", u.email).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()), "invites");
  return c.json({
    user: { ...(profile as object), is_platform_admin: u.isPlatformAdmin },
    organizations: orgs.filter((m) => !m.organizations.deleted_at).map((m) => ({ ...m.organizations, role: m.role })),
    pending_invitations: invites,
    features,
  });
});

account.patch("/me", requireUser, async (c) => {
  const u = c.get("user")!;
  const b = await body(c, z.object({
    full_name: z.string().max(120).optional(), avatar_url: z.string().url().max(500).nullable().optional(),
    timezone: z.string().max(64).optional(), notification_prefs: z.record(z.string(), z.boolean()).optional(),
  }));
  const p = must(await db.from("profiles").update({ ...b, updated_at: new Date().toISOString() }).eq("id", u.id).select("*").single(), "profile");
  return c.json(p);
});

account.post("/orgs", requireUser, async (c) => {
  const u = c.get("user")!;
  const b = await body(c, z.object({ name: z.string().trim().min(1).max(120), intended_use: z.enum(["web", "inbox", "api"]).optional(), timezone: z.string().max(64).optional() }));
  const org = must(await db.from("organizations").insert({ name: b.name, intended_use: b.intended_use ?? null, timezone: b.timezone ?? "UTC" }).select("*").single(), "org") as any;
  must(await db.from("memberships").insert({ org_id: org.id, user_id: u.id, role: "owner" }), "membership");
  await startTrial(org.id);
  await audit(c, "org.create", { orgId: org.id, targetType: "organization", targetId: org.id });
  return c.json(org, 201);
});

account.post("/invitations/accept", requireUser, async (c) => {
  const u = c.get("user")!;
  const b = await body(c, z.object({ token: z.string().min(10).optional(), invitation_id: z.string().uuid().optional() }));
  let q = db.from("invitations").select("*").is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString());
  q = b.token ? q.eq("token_hash", sha256(b.token)) : q.eq("id", b.invitation_id!).eq("email", u.email);
  const inv = must(await q.maybeSingle(), "invitation") as any;
  if (!inv) fail("not_found", "This invitation is invalid or has expired");
  if (inv.email !== u.email) fail("forbidden", `This invitation was sent to ${inv.email}. Sign in with that address to accept it.`);
  const seats = await planState(inv.org_id);
  const { count } = await db.from("memberships").select("user_id", { count: "exact", head: true }).eq("org_id", inv.org_id);
  if (seats.entitlements.seats != null && (count ?? 0) >= seats.entitlements.seats) fail("plan_limit", "This workspace has no free seats. Ask an owner to upgrade.");
  await db.from("memberships").upsert({ org_id: inv.org_id, user_id: u.id, role: inv.role }, { onConflict: "org_id,user_id", ignoreDuplicates: true });
  await db.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id);
  await audit(c, "member.join", { orgId: inv.org_id, targetType: "user", targetId: u.id, data: { role: inv.role } });
  return c.json({ org_id: inv.org_id });
});

// ---------------- Organization ----------------
workspace.get("/org", async (c) => {
  const a = need(c, "messages:read");
  const org = must(await db.from("organizations").select("*").eq("id", a.orgId).single(), "org");
  const [plan, use, members] = await Promise.all([planState(a.orgId), usage(a.orgId), db.from("memberships").select("user_id", { count: "exact", head: true }).eq("org_id", a.orgId)]);
  return c.json({ ...(org as object), role: a.role ?? null, plan, usage: { ...use, seats_used: members.count ?? 0 } });
});

const OrgPatch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  logo_url: z.string().url().max(500).nullable().optional(),
  timezone: z.string().max(64).optional(),
  default_sender_id: z.string().uuid().nullable().optional(),
  default_reply_to: z.string().email().nullable().optional(),
  tracking_defaults: z.object({ open: z.boolean(), click: z.boolean(), files: z.boolean() }).optional(),
  consent_language: z.string().max(500).optional(),
  require_tracking_notice: z.boolean().optional(),
  retention_days: z.number().int().min(30).max(3650).optional(),
  custom_field_defs: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]{1,40}$/), label: z.string().max(60), type: z.enum(["text", "number", "date", "boolean"]), applies_to: z.enum(["message", "contact"]) })).max(50).optional(),
});

workspace.patch("/org", async (c) => {
  const a = needWritable(c, "org:manage");
  const b = await body(c, OrgPatch);
  if (b.logo_url !== undefined) await assertFeature(a.orgId, "custom_branding");
  if (b.retention_days) {
    const p = await planState(a.orgId);
    if (p.entitlements.retention_days != null && b.retention_days > p.entitlements.retention_days) fail("plan_limit", `Your plan retains records for up to ${p.entitlements.retention_days} days`);
  }
  if (b.default_sender_id) {
    const s = must(await db.from("sender_identities").select("id").eq("id", b.default_sender_id).eq("org_id", a.orgId).maybeSingle(), "sender");
    if (!s) fail("bad_request", "Sender not found");
  }
  const org = must(await db.from("organizations").update({ ...b, updated_at: new Date().toISOString() }).eq("id", a.orgId).select("*").single(), "org");
  await audit(c, "org.update", { targetType: "organization", targetId: a.orgId, data: { fields: Object.keys(b) } });
  return c.json(org);
});

workspace.post("/org/transfer-ownership", async (c) => {
  const a = needWritable(c, "billing:manage");
  if (a.role !== "owner") fail("forbidden", "Only the owner can transfer ownership");
  const b = await body(c, z.object({ user_id: z.string().uuid() }));
  const target = must(await db.from("memberships").select("role").eq("org_id", a.orgId).eq("user_id", b.user_id).maybeSingle(), "member") as any;
  if (!target) fail("not_found", "That person is not a member of this workspace");
  await db.from("memberships").update({ role: "owner" }).eq("org_id", a.orgId).eq("user_id", b.user_id);
  await db.from("memberships").update({ role: "admin" }).eq("org_id", a.orgId).eq("user_id", a.userId!);
  await audit(c, "org.transfer_ownership", { targetType: "user", targetId: b.user_id });
  return c.json({ ok: true });
});

workspace.post("/org/deletion-request", async (c) => {
  const a = needWritable(c, "billing:manage");
  if (a.role !== "owner") fail("forbidden", "Only the owner can request workspace deletion");
  const r = must(await db.from("deletion_requests").insert({ org_id: a.orgId, requested_by: a.userId }).select("*").single(), "deletion");
  await audit(c, "org.deletion_requested", { targetType: "organization", targetId: a.orgId });
  return c.json(r, 201);
});

workspace.delete("/org/deletion-request", async (c) => {
  const a = need(c, "billing:manage");
  await db.from("deletion_requests").update({ status: "cancelled" }).eq("org_id", a.orgId).eq("status", "pending");
  await audit(c, "org.deletion_cancelled", { targetType: "organization", targetId: a.orgId });
  return c.json({ ok: true });
});

workspace.get("/org/deletion-request", async (c) => {
  const a = need(c, "messages:read");
  const r = must(await db.from("deletion_requests").select("*").eq("org_id", a.orgId).eq("status", "pending").maybeSingle(), "deletion");
  return c.json({ data: r });
});

// ---------------- Team ----------------
workspace.get("/members", async (c) => {
  const a = need(c, "messages:read");
  const rows = must(await db.from("memberships").select("role, created_at, profiles(id, email, full_name, avatar_url)").eq("org_id", a.orgId).order("created_at"), "members");
  const invites = a.scopes.has("team:manage")
    ? must(await db.from("invitations").select("id, email, role, created_at, expires_at").eq("org_id", a.orgId).is("accepted_at", null).is("revoked_at", null).order("created_at", { ascending: false }), "invites")
    : [];
  return c.json({ data: rows, invitations: invites });
});

const assignable = z.enum(["admin", "member", "viewer", "billing"]);

workspace.post("/invitations", async (c) => {
  const a = needWritable(c, "team:manage");
  const b = await body(c, z.object({ email: z.string().trim().toLowerCase().email(), role: assignable }));
  if (b.role === "admin" && a.role !== "owner") fail("forbidden", "Only the owner can invite admins");
  const p = await planState(a.orgId);
  const { count } = await db.from("memberships").select("user_id", { count: "exact", head: true }).eq("org_id", a.orgId);
  if (p.entitlements.seats != null && (count ?? 0) >= p.entitlements.seats) fail("plan_limit", `Your plan includes ${p.entitlements.seats} seats. Upgrade to invite more people.`);
  const raw = token(24);
  const inv = must(await db.from("invitations").insert({ org_id: a.orgId, email: b.email, role: b.role, token_hash: sha256(raw), invited_by: a.userId }).select("id, email, role, expires_at").single(), "invite") as any;
  const org = must(await db.from("organizations").select("name").eq("id", a.orgId).single(), "org") as any;
  const link = `${env.PUBLIC_URL}/app/invite/${raw}`;
  await sendPlatformEmail({
    to: b.email,
    subject: `You're invited to ${org.name} on SentLedger`,
    heading: `Join ${org.name} on SentLedger`,
    body: `${a.email ?? "A teammate"} invited you to join the ${org.name} workspace as ${b.role}. This invitation expires in 7 days.`,
    cta: { label: "Accept invitation", url: link },
  });
  await audit(c, "member.invite", { targetType: "invitation", targetId: inv.id, data: { email: b.email, role: b.role } });
  return c.json({ ...inv, accept_url: env.NODE_ENV === "production" ? undefined : link }, 201);
});

workspace.delete("/invitations/:id", async (c) => {
  const a = needWritable(c, "team:manage");
  await db.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", c.req.param("id")).eq("org_id", a.orgId);
  await audit(c, "member.invite_revoked", { targetType: "invitation", targetId: c.req.param("id") });
  return c.body(null, 204);
});

workspace.patch("/members/:userId", async (c) => {
  const a = needWritable(c, "team:manage");
  const b = await body(c, z.object({ role: assignable }));
  const target = must(await db.from("memberships").select("role").eq("org_id", a.orgId).eq("user_id", c.req.param("userId")).maybeSingle(), "member") as any;
  if (!target) fail("not_found", "Member not found");
  if (target.role === "owner") fail("forbidden", "Transfer ownership before changing the owner's role");
  if ((b.role === "admin" || target.role === "admin") && a.role !== "owner") fail("forbidden", "Only the owner can change admin roles");
  await db.from("memberships").update({ role: b.role as Role }).eq("org_id", a.orgId).eq("user_id", c.req.param("userId"));
  await audit(c, "member.role_change", { targetType: "user", targetId: c.req.param("userId"), data: { from: target.role, to: b.role } });
  return c.json({ ok: true });
});

workspace.delete("/members/:userId", async (c) => {
  const a = actorFor(c);
  const uid = c.req.param("userId");
  const self = uid === a.userId;
  if (!self) needWritable(c, "team:manage");
  const target = must(await db.from("memberships").select("role").eq("org_id", a.orgId).eq("user_id", uid).maybeSingle(), "member") as any;
  if (!target) fail("not_found", "Member not found");
  if (target.role === "owner") fail("forbidden", "The owner can't be removed. Transfer ownership first.");
  if (target.role === "admin" && a.role !== "owner" && !self) fail("forbidden", "Only the owner can remove admins");
  await db.from("memberships").delete().eq("org_id", a.orgId).eq("user_id", uid);
  await audit(c, self ? "member.leave" : "member.remove", { targetType: "user", targetId: uid });
  return c.body(null, 204);
});

function actorFor(c: any) {
  const a = c.get("actor");
  if (!a || a.kind !== "user") fail("forbidden", "Team management requires a signed-in user");
  return a;
}

// ---------------- Usage & audit ----------------
workspace.get("/usage", async (c) => {
  const a = need(c, "billing:read");
  const [p, u] = await Promise.all([planState(a.orgId), usage(a.orgId)]);
  const storage = must(await db.from("files").select("size").eq("org_id", a.orgId).is("deleted_at", null), "files") as any[];
  const history = must(await db.from("usage_counters").select("*").eq("org_id", a.orgId).order("period", { ascending: false }).limit(12), "history");
  return c.json({ plan: p, current: u, storage_bytes: storage.reduce((s, f) => s + Number(f.size), 0), history });
});

workspace.get("/audit-logs", async (c) => {
  const a = need(c, "audit:read");
  const f = query(c, listQuery.extend({ action: z.string().max(80).optional() }));
  let q = db.from("audit_logs").select("id, action, target_type, target_id, actor_user_id, actor_api_key_id, ip, user_agent, data, created_at")
    .eq("org_id", a.orgId).order("id", { ascending: false }).limit(f.limit + 1);
  if (f.action) q = q.ilike("action", `${f.action}%`);
  if (f.cursor) q = q.lt("id", Number(Buffer.from(f.cursor, "base64url").toString()));
  const rows = must(await q, "audit") as any[];
  const has = rows.length > f.limit;
  const data = has ? rows.slice(0, f.limit) : rows;
  const ids = [...new Set(data.map((r) => r.actor_user_id).filter(Boolean))];
  const people = ids.length ? (must(await db.from("profiles").select("id, email, full_name").in("id", ids), "profiles") as any[]) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return c.json({
    data: data.map((r) => ({ ...r, actor: byId.get(r.actor_user_id) ?? null })),
    has_more: has, next_cursor: has ? Buffer.from(String(data.at(-1).id)).toString("base64url") : null,
  });
});

