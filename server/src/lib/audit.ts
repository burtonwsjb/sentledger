import type { Context } from "hono";
import { db } from "./db";
import { log } from "./log";
import type { AppEnv } from "./auth";
import { clientIp } from "./auth";

/** Append-only audit trail for security-sensitive actions. Never throws. */
export async function audit(
  c: Context<AppEnv> | null,
  action: string,
  opts: { orgId?: string | null; targetType?: string; targetId?: string; data?: Record<string, unknown>; userId?: string } = {},
) {
  const a = c?.get("actor");
  const u = c?.get("user");
  const row = {
    org_id: opts.orgId ?? a?.orgId ?? null,
    actor_user_id: opts.userId ?? u?.id ?? a?.userId ?? null,
    actor_api_key_id: a?.apiKeyId ?? null,
    action,
    target_type: opts.targetType ?? null,
    target_id: opts.targetId ?? null,
    ip: c ? clientIp(c) ?? null : null,
    user_agent: c?.req.header("user-agent")?.slice(0, 300) ?? null,
    data: opts.data ?? {},
  };
  const { error } = await db.from("audit_logs").insert(row);
  if (error) log.error("audit write failed", { action, error: error.message });
}
