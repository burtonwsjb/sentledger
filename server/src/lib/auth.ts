import type { Context, MiddlewareHandler } from "hono";
import { db, must } from "./db";
import { ApiError, fail } from "./errors";
import { sha256 } from "./crypto";
import { platformAdmins } from "../env";

export type Role = "owner" | "admin" | "member" | "viewer" | "billing";

/** Scopes an API key may hold. */
export const API_SCOPES = [
  "messages:write", "messages:read", "events:read", "contacts:read", "contacts:write", "files:write", "files:read",
  "templates:read", "templates:write", "webhooks:manage", "billing:read",
] as const;
/** Session-only scopes (never grantable to API keys). */
export const SESSION_SCOPES = ["billing:manage", "team:manage", "org:manage", "apikeys:manage", "audit:read", "integrations:manage"] as const;
export type Scope = (typeof API_SCOPES)[number] | (typeof SESSION_SCOPES)[number];

const read: Scope[] = ["messages:read", "events:read", "contacts:read", "files:read", "templates:read"];
const write: Scope[] = ["messages:write", "contacts:write", "files:write", "templates:write"];
export const ROLE_SCOPES: Record<Role, Scope[]> = {
  owner: [...API_SCOPES, ...SESSION_SCOPES],
  admin: [...read, ...write, "webhooks:manage", "billing:read", "team:manage", "org:manage", "apikeys:manage", "audit:read", "integrations:manage"],
  member: [...read, ...write, "integrations:manage"],
  viewer: [...read],
  billing: ["billing:read", "billing:manage", "messages:read"],
};

export type SessionUser = { id: string; email: string; isPlatformAdmin: boolean };
export type Actor = {
  kind: "user" | "api_key";
  orgId: string;
  userId?: string;
  email?: string;
  apiKeyId?: string;
  role?: Role;
  scopes: Set<Scope>;
  orgStatus: string;
};

export type AppEnv = { Variables: { requestId: string; user?: SessionUser; actor?: Actor } };

// ---- session verification with a short cache (avoids a network call per request) ----
const cache = new Map<string, { user: SessionUser; exp: number }>();

export async function verifySession(jwt: string): Promise<SessionUser | null> {
  const k = sha256(jwt);
  const hit = cache.get(k);
  if (hit && hit.exp > Date.now()) return hit.user;
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) return null;
  const { data: profile } = await db.from("profiles").select("is_platform_admin").eq("id", data.user.id).maybeSingle();
  const email = (data.user.email ?? "").toLowerCase();
  const user = { id: data.user.id, email, isPlatformAdmin: Boolean(profile?.is_platform_admin) || platformAdmins.has(email) };
  cache.set(k, { user, exp: Date.now() + 60_000 });
  if (cache.size > 5000) for (const [key, v] of cache) if (v.exp < Date.now()) cache.delete(key);
  return user;
}

const bearer = (c: Context) => {
  const h = c.req.header("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
};

/** Requires a signed-in Supabase user (no org context). */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const t = bearer(c);
  if (!t || t.startsWith("sl_")) fail("unauthorized", "Sign in required");
  const user = await verifySession(t!);
  if (!user) fail("unauthorized", "Session expired. Please sign in again.");
  c.set("user", user!);
  await next();
};

export async function actorForUser(user: SessionUser, orgId: string): Promise<Actor> {
  const m = await db.from("memberships").select("role, organizations!inner(status, deleted_at)").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  const row = must(m, "membership") as { role: Role; organizations: { status: string; deleted_at: string | null } } | null;
  if (!row || row.organizations.deleted_at) fail("forbidden", "You are not a member of this workspace");
  return { kind: "user", orgId, userId: user.id, email: user.email, role: row!.role, scopes: new Set(ROLE_SCOPES[row!.role]), orgStatus: row!.organizations.status };
}

export async function actorForApiKey(raw: string, ip: string | undefined): Promise<Actor> {
  const res = await db.from("api_keys").select("id, org_id, scopes, expires_at, revoked_at, ip_allowlist, organizations!inner(status, deleted_at)").eq("key_hash", sha256(raw)).maybeSingle();
  const key = must(res, "api key") as any;
  if (!key || key.revoked_at) fail("unauthorized", "Invalid or revoked API key");
  if (key.expires_at && new Date(key.expires_at) < new Date()) fail("unauthorized", "API key expired");
  if (key.organizations.deleted_at) fail("unauthorized", "Workspace deleted");
  if (key.ip_allowlist?.length && (!ip || !key.ip_allowlist.includes(ip))) fail("forbidden", "Request IP is not allowed for this API key");
  void db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id).then(() => {});
  return { kind: "api_key", orgId: key.org_id, apiKeyId: key.id, scopes: new Set(key.scopes), orgStatus: key.organizations.status };
}

export const clientIp = (c: Context) =>
  (c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || undefined);

/**
 * /v1 authentication: either an API key (Bearer sl_...) bound to one organization,
 * or a Supabase session token + X-Org-Id header (used by the SentLedger web app).
 */
export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
  const t = bearer(c);
  if (!t) fail("unauthorized", "Missing Authorization: Bearer <api key or session token>");
  if (t!.startsWith("sl_")) {
    c.set("actor", await actorForApiKey(t!, clientIp(c)));
  } else {
    const user = await verifySession(t!);
    if (!user) fail("unauthorized", "Session expired. Please sign in again.");
    c.set("user", user!);
    const orgId = c.req.header("x-org-id");
    if (!orgId) fail("bad_request", "X-Org-Id header is required with a session token");
    c.set("actor", await actorForUser(user!, orgId!));
  }
  await next();
};

export function actor(c: Context<AppEnv>): Actor {
  const a = c.get("actor");
  if (!a) throw new ApiError("unauthorized", "Not authenticated");
  return a;
}

export function need(c: Context<AppEnv>, scope: Scope): Actor {
  const a = actor(c);
  if (!a.scopes.has(scope)) fail("forbidden", `This action requires the ${scope} permission`);
  return a;
}

export function needWritable(c: Context<AppEnv>, scope: Scope): Actor {
  const a = need(c, scope);
  if (a.orgStatus === "suspended") fail("suspended", "This workspace is suspended. Contact support.");
  return a;
}

export const requirePlatformAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const u = c.get("user");
  if (!u?.isPlatformAdmin) fail("forbidden", "Platform administrators only");
  await next();
};
