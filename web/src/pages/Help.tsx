import { useState } from "react";
import { api } from "../lib/api";
import { useApi } from "../lib/hooks";
import { fmtDate } from "../lib/format";
import { Badge, Button, Card, ErrorState, Input, PageHeader, Spinner, Table, Tabs, Td, useToast } from "../components/ui";

const FAQ: [string, string][] = [
  ["Why does a message show as opened when the recipient says they didn't open it?", "Some mail apps and security tools load images automatically. Apple Mail Privacy Protection loads images for every message, and corporate scanners open links to check them. SentLedger marks those events as \"uncertain\" or \"privacy proxy\"; look for a later open from a desktop or mobile device."],
  ["Why does a message show no opens when the recipient says they read it?", "Their mail app probably blocks images. Link clicks and secure-file views are more reliable signals — attach documents as secure files when a record matters."],
  ["What's the difference between \"accepted\" and \"delivered\"?", "Accepted means the sending provider took the message. Delivered means the recipient's mail server accepted it. Neither means a person saw it. Gmail and Microsoft 365 connections don't report delivery."],
  ["Can I edit a message after sending it?", "No. Sent content is frozen and fingerprinted so the record stays trustworthy. You can revoke secure-file and link access, or send a corrected message."],
  ["How do I prove a record wasn't changed?", "Download the evidence package. It contains the PDF report, JSON ledger, CSV and a manifest with SHA-256 fingerprints. The JSON includes the exact data used to compute each event hash so anyone can verify the chain."],
  ["How do I send from my own domain?", "Go to Integrations → Sending domains, add your domain, and copy the DNS records into your DNS provider. Once verified, add a sender address on that domain."],
];

export function Help() {
  return (
    <>
      <PageHeader title="Help" description="Answers to common questions. Still stuck? Email support@sentledger.com." />
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card title="Frequently asked">
          {FAQ.map(([q, a]) => <details key={q} className="border-b border-line-2 py-3 last:border-0"><summary className="cursor-pointer text-sm font-semibold text-ink">{q}</summary><p className="mt-2 text-sm text-ink-2">{a}</p></details>)}
        </Card>
        <div className="grid content-start gap-5">
          <Card title="Resources"><ul className="grid gap-2 text-sm">
            <li><a className="text-accent underline" href="/developers" target="_blank">API overview</a></li>
            <li><a className="text-accent underline" href="/developers/reference" target="_blank">API reference</a></li>
            <li><a className="text-accent underline" href="/security#limits" target="_blank">Tracking limitations</a></li>
            <li><a className="text-accent underline" href="/legal/acceptable-use" target="_blank">Acceptable use policy</a></li>
          </ul></Card>
          <Card title="Contact support"><p className="text-sm text-ink-2">Email <a className="text-accent underline" href="mailto:support@sentledger.com">support@sentledger.com</a> with your workspace name and, if it's about a message, its ID from the Details tab.</p></Card>
        </div>
      </div>
    </>
  );
}

// ================= Platform admin (restricted server-side to platform admins) =================
export function Admin() {
  const [tab, setTab] = useState<"overview" | "orgs" | "jobs" | "abuse" | "users" | "contact">("overview");
  return (
    <>
      <PageHeader title="Platform admin" description="Operator tools. Every action here is audit-logged." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "overview", label: "Overview" }, { value: "orgs", label: "Organizations" }, { value: "jobs", label: "Jobs" }, { value: "abuse", label: "Abuse reports" }, { value: "users", label: "User lookup" }, { value: "contact", label: "Contact requests" }]} />
      {tab === "overview" && <AdminOverview />}
      {tab === "orgs" && <AdminOrgs />}
      {tab === "jobs" && <AdminJobs />}
      {tab === "abuse" && <AdminAbuse />}
      {tab === "users" && <AdminUsers />}
      {tab === "contact" && <AdminContact />}
    </>
  );
}

function AdminOverview() {
  const o = useApi<any>("/admin/overview");
  if (o.loading && !o.data) return <Spinner />;
  if (o.error) return <ErrorState error={o.error} retry={o.reload} />;
  const d = o.data;
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Organizations", d.organizations], ["Sends (24h)", d.sends_24h], ["Queued jobs", d.queued_jobs], ["Dead jobs", d.dead_jobs], ["Open abuse reports", d.open_abuse_reports]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-card p-4"><div className="text-xs uppercase tracking-wide text-muted">{k}</div><div className="mt-1 font-serif text-2xl font-semibold">{v}</div></div>
        ))}
      </div>
      <Card title="Provider health">{Object.entries(d.providers).map(([k, v]) => <div key={k} className="flex justify-between border-b border-line-2 py-2 text-sm last:border-0"><span>{k}</span><Badge tone={v ? "ok" : "warn"}>{v ? "configured" : "not configured"}</Badge></div>)}</Card>
      <Card title="Subscriptions">{Object.entries(d.subscriptions).map(([k, v]) => <div key={k} className="flex justify-between py-1 text-sm"><span>{k}</span><span>{String(v)}</span></div>)}</Card>
    </div>
  );
}

function AdminOrgs() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const o = useApi<any>(`/admin/organizations${q ? `?q=${encodeURIComponent(q)}` : ""}`, [q]);
  return (
    <Card pad={false}>
      <div className="border-b border-line-2 p-3"><Input className="max-w-sm" placeholder="Search organizations" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {o.loading && !o.data ? <Spinner /> : (
        <Table head={["Name", "Plan", "Sends (month)", "Status", "Created", ""]}>
          {(o.data?.data ?? []).map((x: any) => (
            <tr key={x.id}><Td className="font-medium text-ink">{x.name}<div className="font-mono text-[11px] text-muted">{x.id}</div></Td><Td>{x.subscriptions?.plan_id} · {x.subscriptions?.status}</Td>
              <Td>{x.usage_counters?.find((u: any) => u.period === new Date().toISOString().slice(0, 7))?.sends ?? 0}</Td>
              <Td>{x.status === "suspended" ? <Badge tone="bad">suspended</Badge> : <Badge tone="ok">active</Badge>}</Td><Td className="text-xs">{fmtDate(x.created_at, { dateStyle: "medium" })}</Td>
              <Td><Button size="sm" variant={x.status === "suspended" ? "secondary" : "danger"} onClick={async () => { const reason = x.status === "suspended" ? undefined : window.prompt("Reason for suspension"); if (x.status !== "suspended" && !reason) return; try { await api(`/admin/organizations/${x.id}/suspend`, { body: { suspended: x.status !== "suspended", reason }, org: false }); o.reload(); } catch (e) { toast.error(e as Error); } }}>{x.status === "suspended" ? "Unsuspend" : "Suspend"}</Button></Td></tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function AdminJobs() {
  const toast = useToast();
  const j = useApi<any>("/admin/jobs");
  if (j.loading && !j.data) return <Spinner />;
  return (
    <Card pad={false}>
      <Table head={["Type", "Status", "Attempts", "Last error", "Updated", ""]}>
        {(j.data?.data ?? []).map((x: any) => (
          <tr key={x.id}><Td>{x.type}</Td><Td><Badge tone={x.status === "dead" ? "bad" : x.status === "running" ? "warn" : "muted"}>{x.status}</Badge></Td><Td>{x.attempts}/{x.max_attempts}</Td>
            <Td className="max-w-[360px] truncate text-xs">{x.last_error}</Td><Td className="text-xs">{fmtDate(x.updated_at)}</Td>
            <Td>{x.status === "dead" && <Button size="sm" onClick={async () => { try { await api(`/admin/jobs/${x.id}/retry`, { method: "POST", org: false }); j.reload(); } catch (e) { toast.error(e as Error); } }}>Retry</Button>}</Td></tr>
        ))}
      </Table>
      {!j.data?.data?.length && <p className="px-5 py-6 text-sm text-muted">No failed or pending jobs.</p>}
    </Card>
  );
}

function AdminAbuse() {
  const r = useApi<any>("/admin/abuse-reports");
  if (r.loading && !r.data) return <Spinner />;
  return (
    <Card pad={false}>
      <Table head={["Reason", "Organization", "Details", "Reporter", "Status", ""]}>
        {(r.data?.data ?? []).map((x: any) => (
          <tr key={x.id}><Td>{x.reason}</Td><Td>{x.organizations?.name ?? "—"}</Td><Td className="max-w-[340px] text-xs">{x.details}</Td><Td className="text-xs">{x.reporter_email ?? "—"}</Td><Td><Badge>{x.status}</Badge></Td>
            <Td><select className="rounded border border-line bg-card text-xs" value={x.status} onChange={async (e) => { await api(`/admin/abuse-reports/${x.id}`, { method: "PATCH", body: { status: e.target.value }, org: false }); r.reload(); }}>{["open", "reviewing", "actioned", "dismissed"].map((s) => <option key={s}>{s}</option>)}</select></Td></tr>
        ))}
      </Table>
      {!r.data?.data?.length && <p className="px-5 py-6 text-sm text-muted">No reports.</p>}
    </Card>
  );
}

function AdminUsers() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const toast = useToast();
  return (
    <Card>
      <form className="mb-4 flex gap-2" onSubmit={async (e) => { e.preventDefault(); try { setRows((await api(`/admin/users?email=${encodeURIComponent(q)}`, { org: false })).data); } catch (er) { toast.error(er as Error); } }}>
        <Input className="max-w-sm" placeholder="Email contains…" value={q} onChange={(e) => setQ(e.target.value)} /><Button type="submit">Look up</Button>
      </form>
      <p className="mb-3 text-xs text-muted">Support-safe lookup: account and membership metadata only. Message content is never shown here.</p>
      {rows && (rows.length === 0 ? <p className="text-sm text-muted">No users found.</p> : (
        <Table head={["User", "Workspaces", "Created"]}>{rows.map((u) => <tr key={u.id}><Td>{u.full_name || "—"}<div className="text-xs text-muted">{u.email}</div></Td><Td className="text-xs">{u.memberships.map((m: any) => `${m.organizations.name} (${m.role})`).join(", ") || "—"}</Td><Td className="text-xs">{fmtDate(u.created_at, { dateStyle: "medium" })}</Td></tr>)}</Table>
      ))}
    </Card>
  );
}

function AdminContact() {
  const r = useApi<any>("/admin/contact-requests");
  if (r.loading && !r.data) return <Spinner />;
  return (
    <Card pad={false}>
      <Table head={["From", "Topic", "Message", "Received"]}>
        {(r.data?.data ?? []).map((x: any) => <tr key={x.id}><Td>{x.name}<div className="text-xs text-muted">{x.email}{x.company ? ` · ${x.company}` : ""}</div></Td><Td>{x.topic}</Td><Td className="max-w-[420px] whitespace-pre-wrap text-xs">{x.message}</Td><Td className="text-xs">{fmtDate(x.created_at)}</Td></tr>)}
      </Table>
      {!r.data?.data?.length && <p className="px-5 py-6 text-sm text-muted">No requests yet.</p>}
    </Card>
  );
}
