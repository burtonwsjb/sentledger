import { db, must } from "./db";
import { fail } from "./errors";

export type Entitlements = {
  monthly_sends: number | null;
  tracked_links: boolean;
  attachment_storage_mb: number | null;
  seats: number | null;
  api_access: boolean;
  retention_days: number | null;
  custom_branding: boolean;
  overage_allowed: boolean;
  connected_inboxes: number | null;
  webhooks: number | null;
  contact_sales?: boolean;
};

export type PlanState = {
  planId: string;
  planName: string;
  status: string;
  trialEndsAt: string | null;
  trialExpired: boolean;
  canSend: boolean;
  reason?: string;
  entitlements: Entitlements;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  interval: string | null;
};

export const period = (d = new Date()) => d.toISOString().slice(0, 7);

export async function planState(orgId: string): Promise<PlanState> {
  const res = await db.from("subscriptions").select("*, plans(*)").eq("org_id", orgId).maybeSingle();
  const sub = must(res, "subscription") as any;
  if (!sub) {
    const trial = must(await db.from("plans").select("*").eq("id", "trial").single(), "plan") as any;
    return { planId: "trial", planName: trial.name, status: "none", trialEndsAt: null, trialExpired: true, canSend: false, reason: "No active subscription", entitlements: trial.entitlements, cancelAtPeriodEnd: false, currentPeriodEnd: null, interval: null };
  }
  const trialExpired = sub.status === "trialing" && sub.trial_ends_at && new Date(sub.trial_ends_at) < new Date() && !sub.stripe_subscription_id;
  let canSend = ["trialing", "active", "past_due"].includes(sub.status) && !trialExpired;
  let reason: string | undefined;
  if (trialExpired) reason = "Your free trial has ended. Choose a plan to keep sending — your records stay available.";
  else if (sub.status === "canceled") reason = "Your subscription is canceled. Choose a plan to resume sending — your records stay available.";
  else if (sub.status === "unpaid" || sub.status === "incomplete") { canSend = false; reason = "Payment is required to continue sending."; }
  return {
    planId: sub.plan_id, planName: sub.plans?.name ?? sub.plan_id, status: trialExpired ? "trial_expired" : sub.status,
    trialEndsAt: sub.trial_ends_at, trialExpired: Boolean(trialExpired), canSend, reason,
    entitlements: sub.plans.entitlements, cancelAtPeriodEnd: sub.cancel_at_period_end, currentPeriodEnd: sub.current_period_end,
    interval: sub.billing_interval,
  };
}

export async function usage(orgId: string) {
  const res = await db.from("usage_counters").select("*").eq("org_id", orgId).eq("period", period()).maybeSingle();
  return (must(res, "usage") as any) ?? { sends: 0, api_calls: 0, overage_sends: 0 };
}

/** Server-side enforcement before queueing a send of `count` recipient copies. */
export async function assertCanSend(orgId: string, count: number) {
  const p = await planState(orgId);
  if (!p.canSend) fail("payment_required", p.reason ?? "Sending is not available on this plan");
  const limit = p.entitlements.monthly_sends;
  if (limit != null) {
    const u = await usage(orgId);
    if (u.sends + count > limit && !p.entitlements.overage_allowed) {
      fail("plan_limit", `This would exceed your plan's ${limit.toLocaleString()} sends this month (${u.sends.toLocaleString()} used). Upgrade to send more.`, { limit, used: u.sends });
    }
  }
  return p;
}

export async function recordSends(orgId: string, n: number) {
  const { data } = await db.rpc("increment_usage", { p_org: orgId, p_period: period(), p_sends: n, p_api: 0 });
  const after = (data as any)?.sends ?? 0;
  const before = after - n;
  const p = await planState(orgId);
  const limit = p.entitlements.monthly_sends;
  if (!limit) return;
  for (const pct of [80, 100]) {
    const mark = Math.ceil((limit * pct) / 100);
    if (before < mark && after >= mark) {
      const { queueWebhook } = await import("../services/events");
      const eps = ((await db.from("webhook_endpoints").select("id, events").eq("org_id", orgId).eq("enabled", true)).data ?? [])
        .filter((e: any) => e.events.includes("billing.usage_threshold") || e.events.includes("*")).map((e: any) => e.id);
      await db.from("billing_events").insert({ org_id: orgId, type: "usage.threshold", summary: `${pct}% of monthly sends used (${after}/${limit})` });
      if (eps.length) await queueWebhook(orgId, eps, {
        id: `evt_usage_${orgId.slice(0, 8)}_${period()}_${pct}`, type: "billing.usage_threshold", created_at: new Date().toISOString(),
        schema_version: "2026-09-01", organization_id: orgId, data: { period: period(), percent: pct, used: after, limit },
      });
    }
  }
}

export async function assertFeature(orgId: string, feature: keyof Entitlements, current?: number) {
  const p = await planState(orgId);
  const v = p.entitlements[feature];
  if (v === false) fail("plan_limit", `Your ${p.planName} plan does not include this feature. Upgrade to enable it.`);
  if (typeof v === "number" && current != null && current >= v) fail("plan_limit", `Your ${p.planName} plan allows ${v} — upgrade to add more.`);
  return p;
}
