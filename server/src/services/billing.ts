import Stripe from "stripe";
import { env, features } from "../env";
import { db, must } from "../lib/db";
import { fail } from "../lib/errors";
import { log } from "../lib/log";

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!features.stripe) fail("not_configured", "Billing is not configured yet. Contact sales@sentledger.com to upgrade.");
  client ??= new Stripe(env.STRIPE_SECRET_KEY!);
  return client;
}

/** Every new workspace starts a card-free trial. Nothing is charged unless the customer subscribes. */
export async function startTrial(orgId: string) {
  const trialEnds = new Date(Date.now() + env.TRIAL_DAYS * 86_400_000).toISOString();
  await db.from("subscriptions").upsert({ org_id: orgId, plan_id: "trial", status: "trialing", trial_ends_at: trialEnds }, { onConflict: "org_id", ignoreDuplicates: true });
  await db.from("billing_events").insert({ org_id: orgId, type: "trial.started", summary: `${env.TRIAL_DAYS}-day free trial started` });
}

async function ensureCustomer(orgId: string, email: string) {
  const sub = must(await db.from("subscriptions").select("stripe_customer_id").eq("org_id", orgId).maybeSingle(), "sub") as any;
  if (sub?.stripe_customer_id) return sub.stripe_customer_id as string;
  const org = must(await db.from("organizations").select("name").eq("id", orgId).single(), "org") as any;
  const customer = await stripe().customers.create({ email, name: org.name, metadata: { org_id: orgId } }, { idempotencyKey: `customer:${orgId}` });
  await db.from("subscriptions").update({ stripe_customer_id: customer.id }).eq("org_id", orgId);
  return customer.id;
}

export async function createCheckout(orgId: string, planId: string, interval: "month" | "year", email: string) {
  const plan = must(await db.from("plans").select("*").eq("id", planId).maybeSingle(), "plan") as any;
  if (!plan || plan.id === "trial" || plan.entitlements?.contact_sales) fail("bad_request", "That plan can't be purchased online");
  const price = interval === "year" ? plan.stripe_price_annual : plan.stripe_price_monthly;
  if (!price) fail("not_configured", `The ${plan.name} ${interval === "year" ? "annual" : "monthly"} price has not been configured in Stripe yet`);
  const customer = await ensureCustomer(orgId, email);
  const sub = must(await db.from("subscriptions").select("status, trial_ends_at, stripe_subscription_id").eq("org_id", orgId).maybeSingle(), "sub") as any;
  if (sub?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(sub.status)) fail("conflict", "You already have a subscription. Use Manage billing to change plans.");
  // Honor the remaining free trial: no charge until it ends.
  const trialEnd = sub?.status === "trialing" && sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() > Date.now() + 48 * 3600_000
    ? Math.floor(new Date(sub.trial_ends_at).getTime() / 1000) : undefined;
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    subscription_data: { metadata: { org_id: orgId, plan_id: plan.id }, trial_end: trialEnd },
    metadata: { org_id: orgId, plan_id: plan.id },
    success_url: `${env.PUBLIC_URL}/app/billing?checkout=success`,
    cancel_url: `${env.PUBLIC_URL}/app/billing?checkout=cancelled`,
  });
  return session.url!;
}

export async function createPortal(orgId: string) {
  const sub = must(await db.from("subscriptions").select("stripe_customer_id").eq("org_id", orgId).maybeSingle(), "sub") as any;
  if (!sub?.stripe_customer_id) fail("bad_request", "No billing account yet. Choose a plan first.");
  const session = await stripe().billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: `${env.PUBLIC_URL}/app/billing` });
  return session.url;
}

async function planForPrice(priceId: string | undefined) {
  if (!priceId) return null;
  const r = await db.from("plans").select("id").or(`stripe_price_monthly.eq.${priceId},stripe_price_annual.eq.${priceId}`).maybeSingle();
  return (r.data?.id as string) ?? null;
}

const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

async function syncSubscription(sub: Stripe.Subscription) {
  const orgId = sub.metadata?.org_id ?? (await db.from("subscriptions").select("org_id").eq("stripe_customer_id", String(sub.customer)).maybeSingle()).data?.org_id;
  if (!orgId) { log.warn("stripe subscription without org", { sub: sub.id }); return null; }
  const item = sub.items.data[0];
  const planId = (await planForPrice(item?.price.id)) ?? sub.metadata?.plan_id ?? "starter";
  const status = (["trialing", "active", "past_due", "canceled", "incomplete", "unpaid"] as const).includes(sub.status as any) ? sub.status : sub.status === "incomplete_expired" ? "canceled" : "past_due";
  await db.from("subscriptions").upsert({
    org_id: orgId, plan_id: planId, status, stripe_customer_id: String(sub.customer), stripe_subscription_id: sub.id,
    billing_interval: item?.price.recurring?.interval === "year" ? "year" : "month",
    trial_ends_at: iso(sub.trial_end), current_period_end: iso((item as any)?.current_period_end ?? (sub as any).current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end, updated_at: new Date().toISOString(),
  }, { onConflict: "org_id" });
  const ret = must(await db.from("plans").select("entitlements").eq("id", planId).single(), "plan") as any;
  if (ret.entitlements?.retention_days) await db.from("organizations").update({ retention_days: ret.entitlements.retention_days }).eq("id", orgId);
  return orgId as string;
}

async function upsertInvoice(inv: Stripe.Invoice, orgId: string | null) {
  if (!orgId) orgId = (await db.from("subscriptions").select("org_id").eq("stripe_customer_id", String(inv.customer)).maybeSingle()).data?.org_id ?? null;
  if (!orgId) return null;
  await db.from("invoices").upsert({
    org_id: orgId, stripe_invoice_id: inv.id!, number: inv.number, amount_due: inv.amount_due, amount_paid: inv.amount_paid,
    currency: inv.currency, status: inv.status, hosted_invoice_url: inv.hosted_invoice_url, invoice_pdf: inv.invoice_pdf,
    period_start: iso(inv.period_start), period_end: iso(inv.period_end), created_at: iso(inv.created) ?? undefined,
  }, { onConflict: "stripe_invoice_id" });
  return orgId;
}

/** Verified, idempotent Stripe webhook handling. Billing state is only ever changed here. */
export async function handleStripeWebhook(rawBody: string, signature: string) {
  if (!env.STRIPE_WEBHOOK_SECRET) fail("not_configured", "Stripe webhook secret missing");
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(rawBody, signature, env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    fail("unauthorized", "Invalid Stripe signature");
  }
  const ev = event!;
  const claimed = await db.from("billing_events").insert({ stripe_event_id: ev.id, type: ev.type, summary: "processing" }).select("id").single();
  if (claimed.error) return { duplicate: true };

  let orgId: string | null = null;
  let summary: string = ev.type;
  switch (ev.type) {
    case "checkout.session.completed": {
      const s = ev.data.object as Stripe.Checkout.Session;
      if (s.subscription) orgId = await syncSubscription(await stripe().subscriptions.retrieve(String(s.subscription)));
      summary = "Checkout completed";
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = ev.data.object as Stripe.Subscription;
      orgId = await syncSubscription(sub);
      summary = ev.type === "customer.subscription.deleted" ? "Subscription ended" : `Subscription ${sub.status}${sub.cancel_at_period_end ? " (cancels at period end)" : ""}`;
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.finalized": {
      const inv = ev.data.object as Stripe.Invoice;
      orgId = await upsertInvoice(inv, null);
      summary = ev.type === "invoice.payment_failed" ? `Payment failed for invoice ${inv.number ?? inv.id}` : ev.type === "invoice.paid" ? `Invoice ${inv.number ?? inv.id} paid` : `Invoice ${inv.number ?? inv.id} issued`;
      break;
    }
    default:
      break;
  }
  await db.from("billing_events").update({ org_id: orgId, summary, payload: { id: ev.id, type: ev.type, object: (ev.data.object as any).id } }).eq("id", claimed.data!.id);
  if (orgId) await db.from("audit_logs").insert({ org_id: orgId, action: `billing.${ev.type}`, target_type: "stripe_event", target_id: ev.id, data: { summary } });
  return { ok: true };
}
