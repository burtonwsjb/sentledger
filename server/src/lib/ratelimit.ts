import type { MiddlewareHandler } from "hono";
import { fail } from "./errors";
import type { AppEnv } from "./auth";
import { clientIp } from "./auth";

// Fixed-window in-memory limiter. Per replica; plan quotas are enforced in the database.
const buckets = new Map<string, { n: number; reset: number }>();

export function hit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number; reset: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) {
    b = { n: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.n++;
  if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  return { ok: b.n <= limit, remaining: Math.max(0, limit - b.n), reset: b.reset };
}

export function limitBy(name: string, limit: number, windowMs: number, keyFn: (c: any) => string | undefined): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const k = keyFn(c) ?? clientIp(c) ?? "anon";
    const r = hit(`${name}:${k}`, limit, windowMs);
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(r.remaining));
    if (!r.ok) {
      c.header("Retry-After", String(Math.ceil((r.reset - Date.now()) / 1000)));
      fail("rate_limited", "Too many requests. Slow down and retry shortly.");
    }
    await next();
  };
}

export const ipLimit = (name: string, limit: number, windowMs: number) => limitBy(name, limit, windowMs, (c) => clientIp(c));
export const actorLimit = (name: string, limit: number, windowMs: number) =>
  limitBy(name, limit, windowMs, (c) => {
    const a = c.get("actor");
    return a ? a.apiKeyId ?? `${a.orgId}:${a.userId}` : undefined;
  });
