import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Code2, FileText, Inbox, KeyRound, Mail, PenSquare, Plug } from "lucide-react";
import { useApi } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { EVENT_LABEL, ago, num, pct } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorState, PageHeader, Select, Spinner, Stat } from "../components/ui";
import { TrendChart } from "../components/TrendChart";

export function useRange(initial = 30) {
  const [days, setDays] = useState(initial);
  const q = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86_400_000);
    from.setHours(0, 0, 0, 0);
    return `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  }, [days]);
  const control = (
    <Select aria-label="Date range" className="w-40" value={days} onChange={(e) => setDays(Number(e.target.value))}>
      <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 12 months</option>
    </Select>
  );
  return { days, q, control };
}

export function Dashboard() {
  const { org, can, me } = useAuth();
  const range = useRange(30);
  const { data, error, loading, reload } = useApi<any>(`/analytics?${range.q}`, [org?.id]);
  const t = data?.totals;
  const plan = org?.plan;
  const limit = plan?.entitlements?.monthly_sends;
  const used = org?.usage?.sends ?? 0;
  const firstName = (me?.user?.full_name || "").split(" ")[0];

  return (
    <>
      <PageHeader title={firstName ? `Welcome back, ${firstName}` : "Dashboard"} description={`${org?.name ?? ""} · activity across every message, whether it was sent from the app or the API.`}
        actions={<>{range.control}{can("send") && <Link to="/app/send"><Button variant="primary" icon={<PenSquare className="size-4" />}>Send message</Button></Link>}</>} />
      {loading && !data ? <Spinner /> : error ? <ErrorState error={error} retry={reload} /> : (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Sends" value={num(t.sends)} sub={`${num(t.messages)} messages`} />
            <Stat label="Delivered" value={num(t.delivered)} sub={`${pct(t.delivered, t.sends)} of sends · where reported`} />
            <Stat label="Opened" value={num(t.opened)} sub={`${pct(t.opened, t.sends)} · ${num(t.uncertain_opens)} uncertain`} />
            <Stat label="Clicked" value={num(t.clicked)} sub={`${pct(t.clicked, t.sends)} of sends`} />
            <Stat label="Files viewed" value={num(t.files_viewed)} sub="recipients who opened a secure file" />
            <Stat label="Bounced" value={num(t.bounced)} tone={t.bounced ? "bad" : undefined} sub={`${num(t.complained)} spam complaints`} />
            <Stat label="Failed" value={num(t.failed)} tone={t.failed ? "bad" : undefined} sub="not accepted by provider" />
            <Stat label="Pending" value={num(t.pending)} sub={`${num(t.drafts)} drafts`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <Card title="Activity over time">
              {t.messages === 0 && !data.series.some((s: any) => s.sent) ? (
                <Empty icon={<Mail />} title="No sends in this period" body="Send a tracked message and its activity will appear here." action={can("send") ? <Link to="/app/send"><Button variant="primary">Send your first message</Button></Link> : undefined} />
              ) : <TrendChart data={data.series} />}
            </Card>
            <div className="grid gap-5 content-start">
              <Card title="Plan & usage">
                <div className="flex items-baseline justify-between"><span className="text-sm font-semibold text-ink">{plan?.planName}</span>
                  <Badge tone={plan?.canSend ? "ok" : "warn"}>{plan?.status === "trialing" ? "Trial" : plan?.status?.replace("_", " ")}</Badge></div>
                {plan?.status === "trialing" && plan.trialEndsAt && <p className="mt-1 text-xs text-muted">Trial ends {new Date(plan.trialEndsAt).toLocaleDateString()}</p>}
                <div className="mt-4 text-xs text-muted">Sends this month</div>
                <div className="mt-1 flex items-baseline justify-between text-sm"><span className="font-semibold text-ink">{num(used)}</span><span className="text-muted">{limit ? `of ${num(limit)}` : "unlimited"}</span></div>
                {limit ? <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-2" role="progressbar" aria-valuenow={used} aria-valuemax={limit} aria-label="Monthly sends used">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></div> : null}
                {can("billing") && <Link to="/app/billing" className="mt-4 inline-block text-sm font-medium text-accent underline">Manage plan</Link>}
              </Card>
              <Card title="Quick actions">
                <div className="grid grid-cols-2 gap-2">
                  {can("send") && <QA to="/app/send" icon={<PenSquare />} label="Send message" />}
                  {can("edit") && <QA to="/app/templates?new=1" icon={<FileText />} label="New template" />}
                  {can("integrations") && <QA to="/app/integrations" icon={<Plug />} label="Connect inbox" />}
                  {can("apikeys") && <QA to="/app/developers?new=1" icon={<KeyRound />} label="Create API key" />}
                  <QA to="/app/messages" icon={<Inbox />} label="All messages" />
                  <QA to="/app/developers" icon={<Code2 />} label="API quickstart" />
                </div>
              </Card>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Recent activity" className="lg:col-span-2" pad={false}>
              {data.recent.length === 0 ? <Empty title="Nothing yet" body="Events appear as messages are sent, delivered and opened." /> : (
                <ul className="divide-y divide-line-2">
                  {data.recent.map((e: any) => (
                    <li key={e.id}>
                      <Link to={`/app/messages/${e.message_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-paper-2">
                        <span className={`size-2 shrink-0 rounded-full ${e.type.match(/bounced|failed/) ? "bg-danger" : e.uncertain ? "bg-gold" : "bg-accent"}`} />
                        <div className="min-w-0 flex-1"><div className="truncate text-sm text-ink"><b className="font-semibold">{EVENT_LABEL[e.type] ?? e.type}</b>{e.message_recipients?.email ? ` · ${e.message_recipients.email}` : ""}</div>
                          <div className="truncate text-xs text-muted">{e.messages?.subject}</div></div>
                        {e.uncertain && <Badge tone="warn">uncertain</Badge>}
                        <span className="shrink-0 text-xs text-muted">{ago(e.occurred_at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <div className="grid content-start gap-5">
              <Card title="Top templates" pad={false}>
                {data.top_templates.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No template sends yet.</p> :
                  <ul className="divide-y divide-line-2">{data.top_templates.map((x: any) => <li key={x.id} className="flex justify-between gap-3 px-5 py-2.5 text-sm"><Link to={`/app/templates/${x.id}`} className="truncate text-ink hover:underline">{x.name}</Link><span className="shrink-0 text-muted">{x.sent} sent</span></li>)}</ul>}
              </Card>
              <Card title="Top links" pad={false}>
                {data.top_links.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No tracked clicks yet.</p> :
                  <ul className="divide-y divide-line-2">{data.top_links.map((x: any) => <li key={x.url} className="flex justify-between gap-3 px-5 py-2.5 text-sm"><span className="truncate text-ink" title={x.url}>{x.url.replace(/^https?:\/\//, "")}</span><span className="shrink-0 text-muted">{x.clicks}</span></li>)}</ul>}
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const QA = ({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) => (
  <Link to={to} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm text-ink hover:bg-paper-2 [&>svg]:size-4 [&>svg]:text-accent">{icon}{label}</Link>
);

export function Analytics() {
  const { org } = useAuth();
  const range = useRange(30);
  const { data, error, loading, reload } = useApi<any>(`/analytics?${range.q}`, [org?.id]);
  const t = data?.totals;
  const bars = (obj: Record<string, number>, labels: Record<string, string> = {}) => {
    const entries = Object.entries(obj ?? {}).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...entries.map((e) => e[1]));
    if (!entries.length) return <p className="text-sm text-muted">No data in this period.</p>;
    return (
      <ul className="grid gap-2.5">
        {entries.map(([k, v]) => (
          <li key={k} className="grid grid-cols-[110px_1fr_48px] items-center gap-3 text-sm" title={`${labels[k] ?? k}: ${v}`}>
            <span className="truncate text-ink-2">{labels[k] ?? k}</span>
            <span className="h-2.5 rounded-r-[4px] bg-[var(--s1)]" style={{ width: `${(v / max) * 100}%`, minWidth: 4 }} />
            <span className="text-right tabular-nums text-ink">{v}</span>
          </li>
        ))}
      </ul>
    );
  };
  return (
    <>
      <PageHeader title="Analytics" description="Engagement across all messages. Uncertain opens (privacy proxies, scanners, instant loads) are counted separately so they don't inflate your read rate." actions={range.control} />
      {loading && !data ? <Spinner /> : error ? <ErrorState error={error} retry={reload} /> : (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Open rate" value={pct(t.opened, t.sends)} sub={`${num(t.opened)} of ${num(t.sends)} sends`} />
            <Stat label="Click rate" value={pct(t.clicked, t.sends)} sub={`${num(t.clicked)} recipients`} />
            <Stat label="Delivery rate" value={pct(t.delivered, t.sends)} sub="managed sending only" />
            <Stat label="Uncertain opens" value={num(t.uncertain_opens)} sub="proxy / scanner / instant" />
          </div>
          <Card title="Daily activity"><TrendChart data={data.series} height={300} /></Card>
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Opens by device">{bars(data.devices, { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet", proxy: "Privacy proxy", bot: "Automated", unknown: "Unknown" })}</Card>
            <Card title="Messages by source">{bars(data.by_source, { web: "Web app", api: "API", extension: "Extension" })}</Card>
          </div>
          <p className="text-xs text-muted">Rates are per recipient copy. Opens can't be detected when images are blocked, and privacy proxies can load images without anyone reading — see <a className="underline" href="/security#limits">tracking limitations</a>.</p>
        </div>
      )}
    </>
  );
}
