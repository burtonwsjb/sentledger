import { db, must } from "../lib/db";
import { decrypt, encrypt, hmac, token } from "../lib/crypto";
import { RetryLater, registerJob } from "./jobs";

/**
 * Customer webhook signing: header `SentLedger-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`.
 * Retries: 8 attempts with exponential backoff (1m, 5m, 30m, 2h, 6h, 12h, 24h) — cutoff about 45 hours after the event.
 */
export const RETRY_SCHEDULE_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000, 12 * 3600_000, 24 * 3600_000];

export const newWebhookSecret = () => `whsec_${token(24)}`;
export const sealSecret = (s: string) => encrypt(s);

export function sign(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${hmac(secret, `${t}.${body}`)}`;
}

export function isSafeWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".railway.internal")) return false;
    if (/^(10|127|0)\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || h.startsWith("[")) return false;
    return true;
  } catch {
    return false;
  }
}

export async function deliver(deliveryId: string, attempt: number, final: boolean) {
  const d = must(await db.from("webhook_deliveries").select("*, webhook_endpoints(url, secret_enc, enabled)").eq("id", deliveryId).single(), "delivery") as any;
  if (d.status === "succeeded") return;
  const ep = d.webhook_endpoints;
  if (!ep?.enabled) {
    await db.from("webhook_deliveries").update({ status: "failed", last_error: "endpoint disabled" }).eq("id", deliveryId);
    return;
  }
  const body = JSON.stringify(d.payload);
  const started = Date.now();
  let status: number | null = null;
  let error: string | null = null;
  let snippet: string | null = null;
  try {
    const res = await fetch(ep.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "SentLedger-Webhooks/1.0",
        "SentLedger-Signature": sign(decrypt(ep.secret_enc), body),
        "SentLedger-Event-Id": d.event_id,
        "SentLedger-Event-Type": d.event_type,
        "SentLedger-Delivery-Id": d.id,
      },
      body,
    });
    status = res.status;
    snippet = (await res.text().catch(() => "")).slice(0, 500);
  } catch (e) {
    error = (e as Error).message;
  }
  const ok = status != null && status >= 200 && status < 300;
  await db.from("webhook_attempts").insert({ delivery_id: d.id, org_id: d.org_id, status_code: status, duration_ms: Date.now() - started, error, response_snippet: snippet });
  await db.from("webhook_deliveries").update({
    attempts: d.attempts + 1, last_status_code: status, last_error: error ?? (ok ? null : `HTTP ${status}`),
    status: ok ? "succeeded" : final ? "failed" : "pending", updated_at: new Date().toISOString(),
    next_attempt_at: ok || final ? null : new Date(Date.now() + (RETRY_SCHEDULE_MS[attempt - 1] ?? 86_400_000)).toISOString(),
  }).eq("id", d.id);
  if (!ok && !final) throw new RetryLater(error ?? `HTTP ${status}`, RETRY_SCHEDULE_MS[attempt - 1]);
}

registerJob("deliver_webhook", async (p, job) => {
  await deliver(p.delivery_id, job.attempts, job.attempts >= job.max_attempts);
});
