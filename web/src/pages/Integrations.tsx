import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Globe, Mail, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi } from "../lib/hooks";
import { ago, fmtDate } from "../lib/format";
import { Badge, Button, Card, CopyField, Empty, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Table, Td, useToast } from "../components/ui";

export function Integrations() {
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  const { can, org, refreshOrg, me } = useAuth();
  const conns = useApi<any>("/integrations", [org?.id]);
  const domains = useApi<any>("/domains", [org?.id]);
  const senders = useApi<any>("/senders", [org?.id]);
  const [addDomain, setAddDomain] = useState(false);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [newSender, setNewSender] = useState({ email: "", name: "" });
  const [dnsFor, setDnsFor] = useState<any>(null);

  useEffect(() => {
    const ok = sp.get("connected"), err = sp.get("error");
    if (ok) toast.ok(`Connected ${ok}`);
    if (err) toast.error(err);
    if (ok || err) setSp({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async (p: "gmail" | "microsoft") => {
    setBusy(p);
    try { const r = await api(`/integrations/${p}/connect`, { method: "POST" }); location.href = r.url; } catch (e) { toast.error(e as Error); setBusy(null); }
  };

  if (conns.loading && !conns.data) return <Spinner />;
  if (conns.error) return <ErrorState error={conns.error} retry={conns.reload} />;
  const av = conns.data.available;

  return (
    <>
      <PageHeader title="Integrations" description="Choose how messages leave SentLedger. Every method feeds the same evidence ledger — what differs is which events the provider reports." />
      <div className="grid gap-5">
        <Card title="Connected inboxes" pad={false}>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {(["gmail", "microsoft"] as const).map((p) => (
              <div key={p} className="rounded-xl border border-line p-4">
                <div className="flex items-center gap-2"><Mail className="size-5 text-accent" /><span className="font-semibold text-ink">{p === "gmail" ? "Gmail / Google Workspace" : "Microsoft 365 / Outlook"}</span></div>
                <p className="mt-2 text-sm text-ink-2">{av[p].tracking}</p>
                <p className="mt-2 text-xs text-muted">Permissions requested: {av[p].scopes.filter((s: string) => !["openid", "email"].includes(s)).map((s: string) => s.split("/").pop()).join(", ")} — send only; SentLedger can't read your mailbox.</p>
                <Button className="mt-3" variant="primary" size="sm" disabled={!av[p].configured || !can("integrations")} loading={busy === p} onClick={() => connect(p)}>Connect {p === "gmail" ? "Gmail" : "Microsoft 365"}</Button>
                {!av[p].configured && <p className="mt-2 text-xs text-muted">Not yet enabled on this SentLedger server.</p>}
              </div>
            ))}
          </div>
          {conns.data.data.length > 0 && (
            <Table head={["Account", "Provider", "Status", "Last used", "Connected", ""]}>
              {conns.data.data.map((c: any) => (
                <tr key={c.id}>
                  <Td className="font-medium text-ink">{c.account_email}{c.user_id === me?.user?.id && <span className="ml-1 text-xs text-muted">(you)</span>}</Td><Td>{c.provider === "gmail" ? "Gmail" : "Microsoft 365"}</Td>
                  <Td>{c.status === "connected" ? <Badge tone="ok">connected</Badge> : c.status === "needs_reauth" ? <Badge tone="warn">reconnect needed</Badge> : <Badge>disconnected</Badge>}{c.last_error && <div className="mt-1 max-w-[260px] text-xs text-danger">{c.last_error}</div>}</Td>
                  <Td className="text-xs">{c.last_used_at ? ago(c.last_used_at) : "Never"}</Td><Td className="text-xs">{fmtDate(c.created_at, { dateStyle: "medium" })}</Td>
                  <Td className="whitespace-nowrap">
                    {c.status !== "connected" && <Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => connect(c.provider)}>Reconnect</Button>}
                    {c.status !== "disconnected" && <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { if (!confirm(`Disconnect ${c.account_email}? Tokens are deleted immediately.`)) return; try { await api(`/integrations/${c.id}`, { method: "DELETE" }); conns.reload(); senders.reload(); toast.ok("Disconnected"); } catch (e) { toast.error(e as Error); } }}>Disconnect</Button>}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Sending domains" action={can("org") && <Button size="sm" variant="primary" icon={<Globe className="size-4" />} disabled={!av.managed.configured} onClick={() => setAddDomain(true)}>Add domain</Button>} pad={false}>
          <p className="px-5 pt-4 text-sm text-ink-2">Send as <b>you@yourcompany.com</b> through SentLedger. {av.managed.tracking} Until a domain is verified, messages go out as "{org?.name} via SentLedger" with replies to you.</p>
          {!av.managed.configured && <Notice tone="info" className="mx-5 mt-3">Custom domains become available once SentLedger email delivery is configured.</Notice>}
          {domains.loading && !domains.data ? <Spinner /> : !domains.data?.data?.length ? <Empty icon={<Globe />} title="No domains yet" body="Add your domain, then copy the DNS records into your DNS provider (for example Namecheap, GoDaddy or Cloudflare)." /> : (
            <Table head={["Domain", "Status", "Last checked", ""]} className="mt-3">
              {domains.data.data.map((d: any) => (
                <tr key={d.id}><Td className="font-medium text-ink">{d.domain}</Td>
                  <Td>{d.status === "verified" ? <Badge tone="ok">verified</Badge> : d.status === "failed" ? <Badge tone="bad">failed</Badge> : <Badge tone="warn">pending DNS</Badge>}</Td>
                  <Td className="text-xs">{d.last_checked_at ? ago(d.last_checked_at) : "—"}</Td>
                  <Td className="whitespace-nowrap"><Button size="sm" onClick={() => setDnsFor(d)}>DNS records</Button>
                    {d.status !== "verified" && <Button size="sm" variant="ghost" loading={busy === d.id} onClick={async () => { setBusy(d.id); try { const r = await api(`/domains/${d.id}/verify`, { method: "POST" }); domains.reload(); toast[r.status === "verified" ? "ok" : "info"](r.status === "verified" ? "Domain verified" : "Not verified yet — DNS can take up to 48 hours"); } catch (e) { toast.error(e as Error); } finally { setBusy(null); } }}>Check now</Button>}
                    {can("org") && <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { if (!confirm(`Remove ${d.domain}? Senders on it will be removed.`)) return; try { await api(`/domains/${d.id}`, { method: "DELETE" }); domains.reload(); senders.reload(); } catch (e) { toast.error(e as Error); } }}><Trash2 className="size-3.5" /></Button>}</Td></tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Sender identities">
          <div className="grid gap-4">
            <Field label="Default sender" hint="Used when a message doesn't pick one.">
              <Select disabled={!can("org")} value={org?.default_sender_id ?? ""} onChange={async (e) => { try { await api("/org", { method: "PATCH", body: { default_sender_id: e.target.value || null } }); await refreshOrg(); toast.ok("Default sender updated"); } catch (er) { toast.error(er as Error); } }}>
                <option value="">{org?.name} via SentLedger</option>
                {(senders.data?.data ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name ? `${s.name} <${s.email}>` : s.email} ({s.kind})</option>)}
              </Select>
            </Field>
            {can("org") && (domains.data?.data ?? []).some((d: any) => d.status === "verified") && (
              <form className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={async (e) => { e.preventDefault(); try { await api("/senders", { body: newSender }); setNewSender({ email: "", name: "" }); senders.reload(); toast.ok("Sender added"); } catch (er) { toast.error(er as Error); } }}>
                <Field label="New sender address"><Input type="email" required value={newSender.email} onChange={(e) => setNewSender({ ...newSender, email: e.target.value })} placeholder="claims@yourdomain.com" /></Field>
                <Field label="Display name"><Input value={newSender.name} onChange={(e) => setNewSender({ ...newSender, name: e.target.value })} placeholder="Harbor Auto Body Claims" /></Field>
                <Button type="submit">Add sender</Button>
              </form>
            )}
          </div>
        </Card>
      </div>

      <Modal open={addDomain} onClose={() => setAddDomain(false)} title="Add a sending domain" footer={<><Button variant="ghost" onClick={() => setAddDomain(false)}>Cancel</Button>
        <Button variant="primary" loading={busy === "add"} disabled={!domain} onClick={async () => { setBusy("add"); try { const d = await api("/domains", { body: { domain } }); setAddDomain(false); setDomain(""); domains.reload(); setDnsFor(d); } catch (e) { toast.error(e as Error); } finally { setBusy(null); } }}>Add domain</Button></>}>
        <Field label="Domain" hint="Use a subdomain like mail.yourcompany.com if your root domain already sends lots of email."><Input autoFocus value={domain} onChange={(e) => setDomain(e.target.value.trim().toLowerCase())} placeholder="yourcompany.com" /></Field>
      </Modal>
      <Modal open={Boolean(dnsFor)} onClose={() => setDnsFor(null)} title={`DNS records for ${dnsFor?.domain ?? ""}`} wide>
        {dnsFor && <div className="grid gap-4">
          <p className="text-sm text-ink-2">Add these records at your DNS provider, then click "Check now". SPF and DKIM prove SentLedger may send for your domain; DMARC tells receivers what to do with mail that fails those checks.</p>
          {dnsFor.dns_records.map((r: any, i: number) => (
            <div key={i} className="rounded-lg border border-line-2 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm"><Badge>{r.type}</Badge><b>{r.record ?? r.type}</b>{r.status && <Badge tone={r.status === "verified" ? "ok" : r.status === "recommended" ? "muted" : "warn"}>{r.status}</Badge>}{r.priority != null && <span className="text-xs text-muted">priority {r.priority}</span>}</div>
              <div className="grid gap-2 sm:grid-cols-2"><div><div className="text-xs text-muted">Host / name</div><CopyField value={r.name} /></div><div><div className="text-xs text-muted">Value</div><CopyField value={r.value} /></div></div>
            </div>
          ))}
        </div>}
      </Modal>
    </>
  );
}
