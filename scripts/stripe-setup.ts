/**
 * Creates Stripe products + monthly/annual prices for each plan and stores the price IDs in the plans table.
 * Edit PRICES below (in cents) before running. Run: STRIPE_SECRET_KEY=sk_... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun scripts/stripe-setup.ts
 * Safe to re-run: it reuses products by lookup key and creates new prices only when amounts change.
 */
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const PRICES: Record<string, { month: number; year: number } | null> = {
  // TODO(owner): set real prices in cents before running. Nothing is created for plans left null.
  starter: null,
  pro: null,
  business: null,
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

for (const [planId, p] of Object.entries(PRICES)) {
  if (!p) { console.log(`skip ${planId}: no price set`); continue; }
  const { data: plan } = await db.from("plans").select("*").eq("id", planId).single();
  if (!plan) throw new Error(`plan ${planId} missing`);
  const found = await stripe.products.search({ query: `metadata['plan_id']:'${planId}'` });
  const product = found.data[0] ?? (await stripe.products.create({ name: `SentLedger ${plan.name}`, description: plan.description ?? undefined, metadata: { plan_id: planId } }));
  const price = async (interval: "month" | "year", amount: number) => {
    const lookup = `${planId}_${interval}_${amount}`;
    const existing = await stripe.prices.list({ lookup_keys: [lookup], limit: 1 });
    return existing.data[0] ?? (await stripe.prices.create({ product: product.id, currency: "usd", unit_amount: amount, recurring: { interval }, lookup_key: lookup, metadata: { plan_id: planId } }));
  };
  const m = await price("month", p.month);
  const y = await price("year", p.year);
  await db.from("plans").update({ stripe_price_monthly: m.id, stripe_price_annual: y.id, price_monthly_cents: p.month, price_annual_cents: p.year }).eq("id", planId);
  console.log(`${planId}: ${m.id} / ${y.id}`);
}
