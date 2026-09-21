import { Hono } from "hono";
import { createHmac } from "node:crypto";
import { env } from "../env";
import { db } from "../lib/db";
import { log } from "../lib/log";
import { safeEqual } from "../lib/crypto";
import type { AppEnv } from "../lib/auth";
import { recordEvent } from "../services/events";

/** Svix-style signature verification used by Resend webhooks. */
export function verifySvix(secret: string, id: string, ts: string, body: string, sigHeader: string): boolean {
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return sigHeader.split(" ").some((part) => {
    const [, sig] = part.split(",");
    return Boolean(sig) && safeEqual(sig!, expected);
  });
}

export const providerWebhooks = new Hono<AppEnv>();

providerWebhooks.post("/webhooks/resend", async (c) => {
  if (!env.RESEND_WEBHOOK_SECRET) return c.json({ error: "not configured" }, 503);
  const body = await c.req.text();
  const id = c.req.header("svix-id") ?? "";
  const ts = c.req.header("svix-timestamp") ?? "";
  const sig = c.req.header("svix-signature") ?? "";
  if (!id || !verifySvix(env.RESEND_WEBHOOK_SECRET, id, ts, body, sig)) return c.json({ error: "invalid signature" }, 401);

  // idempotency: ignore replays of the same delivery
  const seen = await db.from("provider_webhook_events").insert({ id: `resend:${id}`, provider: "resend" });
  if (seen.error) return c.json({ ok: true, duplicate: true });

  const evt = JSON.parse(body) as { type: string; created_at: string; data: any };
  const emailId = evt.data?.email_id;
  if (!emailId) return c.json({ ok: true });
  const map: Record<string, { type: any; status?: string; suppress?: "bounce" | "complaint" }> = {
    "email.delivered": { type: "message.delivered", status: "delivered" },
    "email.delivery_delayed": { type: "message.delivery_delayed" },
    "email.bounced": { type: "message.bounced", status: "bounced", suppress: "bounce" },
    "email.complained": { type: "message.complained", status: "complained", suppress: "complaint" },
    "email.failed": { type: "message.failed", status: "failed" },
  };
  const m = map[evt.type];
  if (!m) return c.json({ ok: true, ignored: evt.type });

  const rcpts = (await db.from("message_recipients").select("id, org_id, message_id, email, status").eq("provider_message_id", emailId)).data ?? [];
  const toList: string[] = (evt.data.to ?? []).map((s: string) => s.toLowerCase().replace(/^.*<|>$/g, ""));
  for (const r of rcpts) {
    if (rcpts.length > 1 && toList.length && !toList.includes(r.email)) continue;
    const bounceType = evt.data.bounce?.type;
    // Soft/transient bounces are recorded but do not suppress future sends.
    const hard = m.suppress !== "bounce" || !bounceType || /permanent|hard/i.test(bounceType);
    await recordEvent({
      orgId: r.org_id, messageId: r.message_id, recipientId: r.id, type: m.type, source: "provider", occurredAt: evt.created_at,
      data: { provider: "resend", provider_event: evt.type, provider_message_id: emailId, bounce: evt.data.bounce ?? undefined },
    });
    if (m.status && r.status !== "bounced" && r.status !== "complained") {
      await db.from("message_recipients").update({ status: m.status, delivered_at: m.status === "delivered" ? evt.created_at : undefined }).eq("id", r.id);
    }
    if (m.suppress && hard) {
      await db.from("suppressions").upsert({ org_id: r.org_id, email: r.email, reason: m.suppress, source_message_id: r.message_id, note: bounceType ?? null }, { onConflict: "org_id,email", ignoreDuplicates: true });
    }
  }
  log.info("resend webhook", { type: evt.type, emailId, matched: rcpts.length });
  return c.json({ ok: true });
});
