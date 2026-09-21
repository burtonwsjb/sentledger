import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi } from "../lib/hooks";
import { fmtDate, num } from "../lib/format";
import { Badge, Button, Card, ErrorState, Notice, PageHeader, Spinner, Table, Td, cx, useToast } from "../components/ui";

const money = (c: number, cur = "usd") => new Intl.NumberFormat(undefined, { style: "currency", currency: cur.toUpperCase() }).format(c / 100);

export function Billing() {
  const { can, org, refreshOrg } = useAuth();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const b = useApi<any>(can("billing:read") ? "/billing" : null, [org?.id]);
  const plans = useApi<any>("/plans", []);
  const usage = useApi<any>(can("billing:read") ? "/usage" : null, [org?.id]);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const s = sp.get("checkout");
    if (s === "success") { toast.ok("Subscription started. It may take a few seconds to appear."); setTimeout(() => { b.reload(); refreshOrg(); }, 2500); }
    if (s === "cancelled") toast.info("Checkout cancelled — no charge was made.");
    if (s) setSp({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!can("billing:read")) return <Notice tone="info">Only owners and billing contacts can view billing.</Notice>;
  if ((b.loading && !b.data) || (plans.loading && !plans.data)) return <Spinner />;
  if (b.error) return <ErrorState error={b.error} retry={b.reload} />;
  const sub = b.data.subscription;
  const p = org?.plan;
  const canManage = can("billing");

  const checkout = async (planId: string) => {
    setBusy(planId);
    try { const r = await api("/billing/checkout", { body: { plan_id: planId, interval } }); location.href = r.url; } catch (e) { toast.error(e as Error); setBusy(null); }
  };
  const portal = async () => {
    setBusy("portal");
    try { const r = await api("/billing/portal", { method: "POST" }); location.href = r.url; } catch (e) { toast.error(e as Error); setBusy(null); }
  };

  return (
    <>
      <PageHeader title="Billing" description="Plans, usage and invoices. Payment details are handled by Stripe."
        actions={canManage && sub?.has_billing_account && <Button icon={<ExternalLink className="size-4" />} loading={busy === "portal"} onClick={portal}>Manage billing</Button>} />
      {!b.data.billing_enabled && <Notice tone="info" className="mb-5">Online checkout isn't switched on yet. <a className="underline" href="/contact?topic=sales">Contact sales</a> to choose a plan — your trial and records are unaffected.</Notice>}
      {sub?.status === "past_due" && <Notice tone="bad" className="mb-5">Your last payment failed. Update your payment method to avoid interruption. {canManage && <button className="font-semibold underline" onClick={portal}>Update payment method</button>}</Notice>}
      {sub?.cancel_at_period_end && <Notice tone="warn" className="mb-5">Your plan is set to cancel on {fmtDate(sub.current_period_end, { dateStyle: "long" })}. Records stay available; sending stops after that date.</Notice>}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Current plan">
          <div className="flex items-baseline justify-between"><span className="font-serif text-2xl font-semibold text-ink">{p?.planName}</span><Badge tone={p?.canSend ? "ok" : "warn"}>{p?.status?.replace("_", " ")}</Badge></div>
          <dl className="mt-4 grid gap-1.5 text-sm">
            {sub?.trial_ends_at && sub.status === "trialing" && <Row k="Trial ends" v={fmtDate(sub.trial_ends_at, { dateStyle: "long" })} />}
            {sub?.billing_interval && <Row k="Billing" v={sub.billing_interval === "year" ? "Annual" : "Monthly"} />}
            {sub?.current_period_end && <Row k={sub.cancel_at_period_end ? "Ends" : "Renews"} v={fmtDate(sub.current_period_end, { dateStyle: "long" })} />}
          </dl>
        </Card>
        <Card title="Usage this month" className="lg:col-span-2">
          {usage.data ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Meter label="Sends" used={usage.data.current.sends} limit={p?.entitlements?.monthly_sends} />
              <Meter label="Storage (MB)" used={Math.round(usage.data.storage_bytes / 1e6)} limit={p?.entitlements?.attachment_storage_mb} />
              <Meter label="Seats" used={org?.usage?.seats_used ?? 0} limit={p?.entitlements?.seats} />
            </div>
          ) : <Spinner />}
          <p className="mt-3 text-xs text-muted">API calls this month: {num(usage.data?.current?.api_calls)}. Records are never deleted because of a limit.</p>
        </Card>
      </div>

      <div className="mt-8 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-semibold text-ink">Plans</h2>
        <div className="inline-flex rounded-lg border border-line bg-paper-2 p-1" role="group" aria-label="Billing interval">
          {(["month", "year"] as const).map((i) => <button key={i} aria-pressed={interval === i} onClick={() => setInterval(i)} className={cx("rounded-md px-3 py-1.5 text-sm font-medium", interval === i ? "bg-card text-ink shadow" : "text-ink-2")}>{i === "month" ? "Monthly" : "Annual"}</button>)}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(plans.data?.data ?? []).filter((x: any) => x.id !== "trial").map((pl: any) => {
          const e = pl.entitlements;
          const price = interval === "year" ? pl.price_annual_cents : pl.price_monthly_cents;
          const current = sub?.plan_id === pl.id && sub?.status !== "canceled" && sub?.status !== "trialing";
          return (
            <Card key={pl.id} className={cx(current && "ring-2 ring-accent")}>
              <div className="flex items-baseline justify-between"><h3 className="text-base font-semibold text-ink">{pl.name}</h3>{current && <Badge tone="ok">Current</Badge>}</div>
              <p className="mt-1 min-h-10 text-sm text-ink-2">{pl.description}</p>
              <div className="mt-3 font-serif text-2xl font-semibold text-ink">{e.contact_sales ? "Custom" : price != null ? `${money(price)}` : "—"}<span className="ml-1 font-sans text-sm font-normal text-muted">{!e.contact_sales && price != null ? `/${interval === "year" ? "yr" : "mo"}` : ""}</span></div>
              <ul className="mt-4 grid gap-1.5 text-sm text-ink-2">
                <Feat>{e.monthly_sends == null ? "Custom" : num(e.monthly_sends)} sends / month</Feat>
                <Feat>{e.seats == null ? "Custom" : e.seats} seats</Feat>
                <Feat>{e.retention_days == null ? "Custom" : `${Math.round(e.retention_days / 30)} months`} retention</Feat>
                <Feat>{e.api_access ? "API & webhooks" : "Web app only"}</Feat>
                {e.custom_branding && <Feat>Custom branding</Feat>}
                {e.overage_allowed && <Feat>Overage available</Feat>}
              </ul>
              <div className="mt-5">
                {e.contact_sales ? <a href="/contact?topic=enterprise"><Button className="w-full">Contact sales</Button></a>
                  : current ? <Button className="w-full" disabled={!sub?.has_billing_account} onClick={portal}>Change in portal</Button>
                  : sub?.has_billing_account && ["active", "past_due"].includes(sub.status) ? <Button className="w-full" onClick={portal} loading={busy === "portal"}>Switch plan</Button>
                  : <Button className="w-full" variant="primary" disabled={!canManage || !pl.purchasable[interval] || !b.data.billing_enabled} loading={busy === pl.id} onClick={() => checkout(pl.id)}>{pl.purchasable[interval] ? (sub?.status === "trialing" ? "Choose plan" : "Subscribe") : "Not available yet"}</Button>}
              </div>
            </Card>
          );
        })}
      </div>
      {sub?.status === "trialing" && <p className="mt-3 text-xs text-muted">Subscribing during your trial won't charge you until the trial ends.</p>}

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card title="Invoices" pad={false}>
          {b.data.invoices.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No invoices yet.</p> : (
            <Table head={["Invoice", "Amount", "Status", "Date", ""]}>
              {b.data.invoices.map((i: any) => <tr key={i.id}><Td>{i.number ?? i.stripe_invoice_id.slice(0, 12)}</Td><Td>{money(i.amount_due, i.currency)}</Td><Td><Badge tone={i.status === "paid" ? "ok" : i.status === "open" ? "warn" : "muted"}>{i.status}</Badge></Td><Td className="text-xs">{fmtDate(i.created_at, { dateStyle: "medium" })}</Td>
                <Td className="whitespace-nowrap">{i.hosted_invoice_url && <a className="mr-3 text-xs text-accent underline" href={i.hosted_invoice_url} target="_blank" rel="noreferrer">View</a>}{i.invoice_pdf && <a className="text-xs text-accent underline" href={i.invoice_pdf} target="_blank" rel="noreferrer">PDF</a>}</Td></tr>)}
            </Table>
          )}
        </Card>
        <Card title="Billing history" pad={false}>
          {b.data.history.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No billing events yet.</p> : (
            <ul className="max-h-80 divide-y divide-line-2 overflow-y-auto">{b.data.history.map((h: any) => <li key={h.id} className="flex justify-between gap-3 px-5 py-2.5 text-sm"><span className="text-ink">{h.summary ?? h.type}</span><span className="shrink-0 text-xs text-muted">{fmtDate(h.created_at, { dateStyle: "medium" })}</span></li>)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-ink">{v}</dd></div>;
const Feat = ({ children }: { children: React.ReactNode }) => <li className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-accent" />{children}</li>;
function Meter({ label, used, limit }: { label: string; used: number; limit: number | null | undefined }) {
  const pctv = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="text-ink-2">{label}</span><span className="text-ink">{num(used)}{limit ? ` / ${num(limit)}` : ""}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-2" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemax={limit ?? undefined}>
        <div className={cx("h-full rounded-full", pctv >= 100 ? "bg-danger" : pctv >= 80 ? "bg-gold" : "bg-accent")} style={{ width: `${limit ? Math.max(2, pctv) : 0}%` }} /></div>
    </div>
  );
}
