import type { Context } from "hono";
import { z } from "zod";
import { db, must } from "./db";
import { fail } from "./errors";
import { sha256 } from "./crypto";
import type { AppEnv } from "./auth";

/** Parse + validate a JSON body with a zod schema. */
export async function body<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    fail("bad_request", "Request body must be valid JSON");
  }
  return schema.parse(raw);
}

export function query<T extends z.ZodTypeAny>(c: Context, schema: T): z.infer<T> {
  return schema.parse(c.req.query());
}

export const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

/** Cursor = base64url("<created_at>|<id>"), newest first. */
export const encodeCursor = (row: { created_at: string; id: string }) => Buffer.from(`${row.created_at}|${row.id}`).toString("base64url");
export function decodeCursor(cursor?: string): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  const [createdAt, id] = Buffer.from(cursor, "base64url").toString().split("|");
  if (!createdAt || !id) fail("bad_request", "Invalid cursor");
  return { createdAt: createdAt!, id: id! };
}

export function applyCursor<Q extends { or: (f: string) => Q }>(q: Q, cursor?: string): Q {
  const c = decodeCursor(cursor);
  return c ? q.or(`created_at.lt.${c.createdAt},and(created_at.eq.${c.createdAt},id.lt.${c.id})`) : q;
}

export function page<T extends { created_at: string; id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, has_more: hasMore, next_cursor: hasMore ? encodeCursor(data[data.length - 1]!) : null };
}

/**
 * Idempotency: same Idempotency-Key + same request body replays the stored response;
 * same key + different body is a 409.
 */
export async function withIdempotency(c: Context<AppEnv>, orgId: string, requestBody: unknown, run: () => Promise<{ status: number; body: unknown }>) {
  const key = c.req.header("idempotency-key");
  if (!key) {
    const r = await run();
    return c.json(r.body as object, r.status as 200);
  }
  if (key.length > 200) fail("bad_request", "Idempotency-Key too long");
  const hash = sha256(JSON.stringify(requestBody ?? null));
  const existing = must(await db.from("idempotency_keys").select("*").eq("org_id", orgId).eq("key", key).maybeSingle(), "idempotency") as any;
  if (existing) {
    if (existing.request_hash !== hash) fail("idempotency_conflict", "Idempotency-Key was already used with a different request body");
    if (existing.status_code == null) fail("conflict", "A request with this Idempotency-Key is still in progress");
    c.header("Idempotent-Replayed", "true");
    return c.json(existing.response, existing.status_code);
  }
  const ins = await db.from("idempotency_keys").insert({ org_id: orgId, key, request_hash: hash });
  if (ins.error) fail("conflict", "A request with this Idempotency-Key is in progress");
  try {
    const r = await run();
    await db.from("idempotency_keys").update({ status_code: r.status, response: r.body }).eq("org_id", orgId).eq("key", key);
    return c.json(r.body as object, r.status as 200);
  } catch (e) {
    await db.from("idempotency_keys").delete().eq("org_id", orgId).eq("key", key);
    throw e;
  }
}
