import { db, must } from "../lib/db";
import { log } from "../lib/log";
import { enqueue } from "./jobs";

export const EVENT_TYPES = [
  "message.created", "message.scheduled", "message.queued", "message.sent", "message.delivered", "message.delivery_delayed",
  "message.opened", "message.clicked", "message.file_viewed", "message.file_downloaded", "message.bounced",
  "message.complained", "message.failed", "message.suppressed", "message.unsubscribed", "message.revoked",
  "message.exported", "message.archived", "message.deleted",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Events customers can subscribe to via webhooks. */
export const WEBHOOK_EVENTS = [
  "message.sent", "message.delivered", "message.opened", "message.clicked", "message.file_viewed", "message.bounced",
  "message.complained", "message.failed", "message.revoked", "message.unsubscribed", "billing.usage_threshold",
] as const;

export const WEBHOOK_SCHEMA_VERSION = "2026-09-01";

export type NewEvent = {
  orgId: string;
  messageId: string;
  recipientId?: string | null;
  type: EventType;
  source: "tracking" | "provider" | "system" | "user" | "api";
  occurredAt?: string;
  ipTruncated?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  device?: string | null;
  isProxy?: boolean;
  uncertain?: boolean;
  isDuplicate?: boolean;
  data?: Record<string, unknown>;
};

/** Appends to the immutable, hash-chained ledger and fans out webhooks for non-duplicate events. */
export async function recordEvent(e: NewEvent) {
  const row = {
    org_id: e.orgId, message_id: e.messageId, recipient_id: e.recipientId ?? null, type: e.type, source: e.source,
    occurred_at: e.occurredAt ?? new Date().toISOString(), ip_truncated: e.ipTruncated ?? null, ip_hash: e.ipHash ?? null,
    user_agent: e.userAgent?.slice(0, 400) ?? null, device: e.device ?? null, is_proxy: e.isProxy ?? false,
    uncertain: e.uncertain ?? false, is_duplicate: e.isDuplicate ?? false, data: e.data ?? {},
  };
  const ev = must(await db.from("events").insert(row).select("*").single(), "event") as any;
  if (!ev.is_duplicate && (WEBHOOK_EVENTS as readonly string[]).includes(ev.type)) {
    fanOut(ev).catch((err) => log.error("webhook fanout failed", { err, event: ev.id }));
  }
  return ev;
}

async function fanOut(ev: any) {
  const endpoints = must(await db.from("webhook_endpoints").select("id, events").eq("org_id", ev.org_id).eq("enabled", true), "endpoints") as any[];
  const targets = endpoints.filter((ep) => ep.events.includes(ev.type) || ep.events.includes("*"));
  if (!targets.length) return;
  const [msg, rcpt] = await Promise.all([
    db.from("messages").select("id, subject, correlation_id, metadata, tags, source").eq("id", ev.message_id).single(),
    ev.recipient_id ? db.from("message_recipients").select("id, email, kind").eq("id", ev.recipient_id).single() : Promise.resolve({ data: null }),
  ]);
  const payload = {
    id: `evt_${ev.id.replaceAll("-", "")}`,
    type: ev.type,
    created_at: ev.occurred_at,
    schema_version: WEBHOOK_SCHEMA_VERSION,
    organization_id: ev.org_id,
    data: {
      message_id: ev.message_id,
      correlation_id: msg.data?.correlation_id,
      subject: msg.data?.subject,
      metadata: msg.data?.metadata ?? {},
      recipient: rcpt.data ? { id: rcpt.data.id, email: rcpt.data.email, kind: rcpt.data.kind } : null,
      event: {
        id: ev.id, type: ev.type, occurred_at: ev.occurred_at, source: ev.source, device: ev.device,
        is_proxy: ev.is_proxy, uncertain: ev.uncertain, details: ev.data, ledger_hash: ev.hash,
      },
    },
  };
  await queueWebhook(ev.org_id, targets.map((t) => t.id), payload);
}

export async function queueWebhook(orgId: string, endpointIds: string[], payload: { id: string; type: string; [k: string]: unknown }) {
  for (const endpointId of endpointIds) {
    const ins = await db.from("webhook_deliveries").insert({ org_id: orgId, endpoint_id: endpointId, event_id: payload.id, event_type: payload.type, payload }).select("id").single();
    if (ins.error) {
      if (ins.error.code !== "23505") log.error("webhook delivery insert failed", { err: ins.error.message });
      continue; // duplicate (endpoint,event) -> idempotent
    }
    await enqueue("deliver_webhook", { delivery_id: ins.data.id }, { maxAttempts: 8 });
  }
}
