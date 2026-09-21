import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { KeyRound, Play, Webhook } from "lucide-react";
import { api, cfg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi, usePaged } from "../lib/hooks";
import { ago, fmtDate } from "../lib/format";
import { Badge, Button, Card, Confirm, CopyField, Empty, ErrorState, Field, Input, LoadMore, Modal, Notice, PageHeader, Select, Spinner, Table, Tabs, Td, cx, useToast } from "../components/ui";

export function Developers() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as "quickstart" | "keys" | "webhooks") ?? (sp.get("new") ? "keys" : "quickstart");
  const { org } = useAuth();
  return (
    <>
      <PageHeader title="API & Webhooks" description={<>Base URL <code className="font-mono text-[13px]">{cfg().publicUrl}/v1</code> · <a className="underline" href="/developers/reference" target="_blank">API reference</a> · <a className="underline" href="/v1/openapi.json" target="_blank">OpenAPI spec</a></>} />
      {org?.plan && !org.plan.entitlements?.api_access && <Notice tone="warn" className="mb-4">Your {org.plan.planName} plan doesn't include API access. Upgrade to create API keys.</Notice>}
      <Tabs value={tab} onChange={(v) => setSp({ tab: v })} tabs={[{ value: "quickstart", label: "Quickstart" }, { value: "keys", label: "API keys" }, { value: "webhooks", label: "Webhooks" }]} />
      {tab === "quickstart" && <Quickstart />}
      {tab === "keys" && <ApiKeys autoOpen={Boolean(sp.get("new"))} />}
      {tab === "webhooks" && <Webhooks />}
    </>
  );
}

// ---------------- Quickstart (calls the real API with a real key) ----------------
function Quickstart() {
  const { me } = useAuth();
  const [key, setKey] = useState("");
  const [to, setTo] = useState(me?.user?.email ?? "");
  const [step, setStep] = useState<"idle" | "sending" | "fetching">("idle");
  const [sent, setSent] = useState<any>(null);
  const [ledger, setLedger] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `${cfg().publicUrl}/v1`;
  const run = async () => {
    setError(null); setSent(null); setLedger(null); setStep("sending");
    try {
      const r = await fetch("/v1/messages", {
        method: "POST",
        headers: { Authorization: `Bearer ${key.trim()}`, "Content-Type": "application/json", "Idempotency-Key": `quickstart-${crypto.randomUUID()}` },
        body: JSON.stringify({ to: [to], subject: "SentLedger API quickstart", html: "<p>This test message was sent through the SentLedger API.</p><p><a href=\"https://sentledger.com/developers\">Open the developer docs</a></p>", metadata: { quickstart: true }, send: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
      setSent(j);
      setStep("fetching");
      await new Promise((res) => setTimeout(res, 2500));
      const l = await fetch(`/v1/messages/${j.id}/evidence`, { headers: { Authorization: `Bearer ${key.trim()}` } });
      const lj = await l.json();
      if (!l.ok) throw new Error(lj.error?.message ?? `HTTP ${l.status}`);
      setLedger(lj);
    } catch (e) { setError((e as Error).message); } finally { setStep("idle"); }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="1 · Send a test message with your API key">
        <div className="grid gap-4">
          <Field label="API key" hint="Needs messages:write and messages:read. Create one on the API keys tab — it's only used in this browser tab."><Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sl_live_…" autoComplete="off" /></Field>
          <Field label="Send to"><Input type="email" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Button variant="primary" icon={<Play className="size-4" />} disabled={!key.startsWith("sl_") || !to} loading={step !== "idle"} onClick={run}>{step === "fetching" ? "Fetching ledger…" : "Run quickstart"}</Button>
          {error && <Notice tone="bad">{error}</Notice>}
          <pre className="overflow-x-auto rounded-lg bg-[#0f1413] p-4 font-mono text-xs leading-relaxed text-[#dfe8e4]">{`curl ${base}/messages \\
  -H "Authorization: Bearer $SENTLEDGER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: my-unique-key-123" \\
  -d '{"to":["${to || "you@example.com"}"],
       "subject":"SentLedger API quickstart",
       "html":"<p>Hello from the API</p>",
       "metadata":{"order_id":"A-1001"},
       "send":true}'

curl ${base}/messages/{id}/evidence \\
  -H "Authorization: Bearer $SENTLEDGER_API_KEY"`}</pre>
        </div>
      </Card>
      <Card title="2 · Response & evidence ledger">
        {!sent ? <p className="text-sm text-muted">Run the quickstart to see the live response from <code>POST /v1/messages</code> and <code>GET /v1/messages/:id/evidence</code>.</p> : (
          <div className="grid gap-3">
            <Notice tone="ok">Message <code className="font-mono">{sent.id}</code> created with status <b>{sent.status}</b>.</Notice>
            {ledger && <>
              <div className="text-sm">Ledger: {ledger.events.length} events · chain {ledger.integrity.chain_valid ? <Badge tone="ok">verified</Badge> : <Badge tone="bad">invalid</Badge>}</div>
              <ul className="grid gap-1 text-xs">{ledger.events.map((e: any) => <li key={e.id} className="flex justify-between gap-2 font-mono"><span>#{e.seq} {e.type}</span><span className="text-muted">{e.hash.slice(0, 12)}…</span></li>)}</ul>
              <details><summary className="cursor-pointer text-sm text-accent">Raw JSON</summary><pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-paper-2 p-3 font-mono text-[11px]">{JSON.stringify(ledger, null, 2)}</pre></details>
            </>}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------- API keys ----------------
function ApiKeys({ autoOpen }: { autoOpen: boolean }) {
  const { can, org } = useAuth();
  const toast = useToast();
  const keys = useApi<any>("/api-keys", [org?.id]);
  const [open, setOpen] = useState(autoOpen);
  const [form, setForm] = useState({ name: "", scopes: ["messages:write", "messages:read", "events:read"] as string[], expires: "", ips: "" });
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState<any>(null);
  if (!can("apikeys")) return <Notice tone="info">Only owners and admins can manage API keys.</Notice>;
  if (keys.loading && !keys.data) return <Spinner />;
  if (keys.error) return <ErrorState error={keys.error} retry={keys.reload} />;
  const scopes: string[] = keys.data.available_scopes;
  const create = async () => {
    setBusy(true);
    try {
      const r = await api("/api-keys", { body: { name: form.name, scopes: form.scopes, expires_at: form.expires ? new Date(form.expires).toISOString() : null, ip_allowlist: form.ips.split(",").map((s) => s.trim()).filter(Boolean) } });
      setSecret(r.secret); keys.reload();
    } catch (e) { toast.error(e as Error); } finally { setBusy(false); }
  };
  const close = () => { setOpen(false); setSecret(null); setForm({ name: "", scopes: ["messages:write", "messages:read", "events:read"], expires: "", ips: "" }); };
  return (
    <Card title="API keys" action={<Button variant="primary" size="sm" icon={<KeyRound className="size-4" />} onClick={() => setOpen(true)}>New key</Button>} pad={false}>
      {keys.data.data.length === 0 ? <Empty icon={<KeyRound />} title="No API keys" body="Keys belong to this workspace and carry only the scopes you choose. The secret is shown once." /> : (
        <Table head={["Name", "Key", "Scopes", "Last used", "Expires", ""]}>
          {keys.data.data.map((k: any) => (
            <tr key={k.id} className={cx(k.revoked_at && "opacity-60")}>
              <Td className="font-medium text-ink">{k.name}</Td><Td><code className="font-mono text-xs">{k.prefix}_…</code></Td>
              <Td><div className="flex max-w-[280px] flex-wrap gap-1">{k.scopes.map((s: string) => <Badge key={s}>{s}</Badge>)}</div>{k.ip_allowlist.length > 0 && <div className="mt-1 text-xs text-muted">IPs: {k.ip_allowlist.join(", ")}</div>}</Td>
              <Td className="text-xs">{k.last_used_at ? ago(k.last_used_at) : "Never"}</Td><Td className="text-xs">{k.expires_at ? fmtDate(k.expires_at, { dateStyle: "medium" }) : "Never"}</Td>
              <Td>{k.revoked_at ? <Badge tone="bad">revoked</Badge> : <button className="text-xs text-danger underline" onClick={() => setRevoke(k)}>Revoke</button>}</Td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={close} title={secret ? "Copy your API key" : "New API key"} footer={secret ? <Button variant="primary" onClick={close}>I've saved it</Button> : <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" loading={busy} disabled={!form.name || !form.scopes.length} onClick={create}>Create key</Button></>}>
        {secret ? (
          <div className="grid gap-3"><Notice tone="warn">This is the only time the full key is shown. Store it in your secrets manager — SentLedger keeps only a hash.</Notice><CopyField value={secret} secret label="API key" /></div>
        ) : (
          <div className="grid gap-4">
            <Field label="Name"><Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Shop management system" /></Field>
            <fieldset><legend className="mb-2 text-[13px] font-semibold text-ink">Scopes</legend>
              <div className="grid grid-cols-2 gap-1.5">{scopes.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.scopes.includes(s)} onChange={(e) => setForm({ ...form, scopes: e.target.checked ? [...form.scopes, s] : form.scopes.filter((x) => x !== s) })} /><code className="font-mono text-xs">{s}</code></label>
              ))}</div></fieldset>
            <Field label="Expires" hint="Optional"><Input type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} /></Field>
            <Field label="Restrict to IP addresses" hint="Optional, comma separated"><Input value={form.ips} onChange={(e) => setForm({ ...form, ips: e.target.value })} placeholder="203.0.113.10" /></Field>
          </div>
        )}
      </Modal>
      <Confirm open={Boolean(revoke)} onClose={() => setRevoke(null)} title={`Revoke "${revoke?.name}"?`} danger confirmLabel="Revoke key" body="Requests using this key will fail immediately. This can't be undone."
        onConfirm={async () => { try { await api(`/api-keys/${revoke.id}/revoke`, { method: "POST" }); toast.ok("Key revoked"); setRevoke(null); keys.reload(); } catch (e) { toast.error(e as Error); } }} />
    </Card>
  );
}

// ---------------- Webhooks ----------------
function Webhooks() {
  const { can, org } = useAuth();
  const toast = useToast();
  const hooks = useApi<any>("/webhooks", [org?.id]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ url: "", description: "", events: ["message.opened", "message.clicked", "message.delivered", "message.bounced"] as string[] });
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { if (hooks.data?.data?.length && !selected) setSelected(hooks.data.data[0].id); }, [hooks.data, selected]);
  if (!can("webhooks")) return <Notice tone="info">Only owners and admins can manage webhooks.</Notice>;
  if (hooks.loading && !hooks.data) return <Spinner />;
  if (hooks.error) return <ErrorState error={hooks.error} retry={hooks.reload} />;
  const events: string[] = hooks.data.available_events;
  const close = () => { setOpen(false); setSecret(null); };
  return (
    <div className="grid gap-5">
      <Card title="Endpoints" action={<Button size="sm" variant="primary" icon={<Webhook className="size-4" />} onClick={() => setOpen(true)}>Add endpoint</Button>} pad={false}>
        {hooks.data.data.length === 0 ? <Empty icon={<Webhook />} title="No webhook endpoints" body="Get a signed POST to your server whenever a message is sent, delivered, opened, clicked or bounced." /> : (
          <ul className="divide-y divide-line-2">{hooks.data.data.map((h: any) => (
            <li key={h.id} className={cx("flex flex-wrap items-center gap-3 px-5 py-3", selected === h.id && "bg-paper-2")}>
              <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(h.id)}><div className="truncate font-mono text-[13px] text-ink">{h.url}</div><div className="text-xs text-muted">{h.events.join(", ")}</div></button>
              {!h.enabled && <Badge>disabled</Badge>}
              <Button size="sm" onClick={async () => { try { await api(`/webhooks/${h.id}/test`, { method: "POST" }); toast.ok("Test event queued"); } catch (e) { toast.error(e as Error); } }}>Send test</Button>
              <Button size="sm" variant="ghost" onClick={async () => { try { await api(`/webhooks/${h.id}`, { method: "PATCH", body: { enabled: !h.enabled } }); hooks.reload(); } catch (e) { toast.error(e as Error); } }}>{h.enabled ? "Disable" : "Enable"}</Button>
              <Button size="sm" variant="ghost" onClick={async () => { if (!confirm("Rotate the signing secret? Your endpoint must switch to the new secret.")) return; try { const r = await api(`/webhooks/${h.id}/rotate-secret`, { method: "POST" }); setSecret(r.secret); setOpen(true); } catch (e) { toast.error(e as Error); } }}>Rotate secret</Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { if (!confirm("Delete this endpoint?")) return; try { await api(`/webhooks/${h.id}`, { method: "DELETE" }); setSelected(null); hooks.reload(); } catch (e) { toast.error(e as Error); } }}>Delete</Button>
            </li>
          ))}</ul>
        )}
      </Card>
      {selected && <Deliveries endpointId={selected} />}
      <Card title="Verifying signatures">
        <p className="mb-3 text-sm text-ink-2">Each request has <code>SentLedger-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code>. Compute HMAC-SHA256 of <code>"&lt;t&gt;.&lt;raw body&gt;"</code> with your endpoint secret and compare. Reject timestamps older than 5 minutes. Deduplicate on the payload <code>id</code>. Failed deliveries retry 8 times over about 45 hours.</p>
      </Card>
      <Modal open={open} onClose={close} title={secret ? "Signing secret" : "Add webhook endpoint"} footer={secret ? <Button variant="primary" onClick={close}>Done</Button> : <><Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={!form.url || !form.events.length} onClick={async () => { setBusy(true); try { const r = await api("/webhooks", { body: form }); setSecret(r.secret); setSelected(r.id); hooks.reload(); } catch (e) { toast.error(e as Error); } finally { setBusy(false); } }}>Add endpoint</Button></>}>
        {secret ? <div className="grid gap-3"><Notice tone="warn">Copy this secret now. You'll use it to verify that requests come from SentLedger.</Notice><CopyField value={secret} secret label="Webhook secret" /></div> : (
          <div className="grid gap-4">
            <Field label="Endpoint URL" hint="Must be a public https:// URL."><Input autoFocus value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/webhooks/sentledger" /></Field>
            <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <fieldset><legend className="mb-2 text-[13px] font-semibold text-ink">Events</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">{events.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.events.includes(ev)} onChange={(e) => setForm({ ...form, events: e.target.checked ? [...form.events, ev] : form.events.filter((x) => x !== ev) })} /><code className="font-mono text-xs">{ev}</code></label>
              ))}</div></fieldset>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Deliveries({ endpointId }: { endpointId: string }) {
  const toast = useToast();
  const [status, setStatus] = useState("");
  const list = usePaged<any>(`/webhooks/${endpointId}/deliveries?limit=25${status ? `&status=${status}` : ""}`);
  const [detail, setDetail] = useState<any>(null);
  return (
    <Card title="Delivery log" action={<Select className="h-8 w-36 text-[13px]" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All</option><option value="succeeded">Succeeded</option><option value="pending">Retrying</option><option value="failed">Failed</option></Select>} pad={false}>
      {list.loading && !list.items.length ? <Spinner /> : !list.items.length ? <p className="px-5 py-6 text-sm text-muted">No deliveries yet. Send a test event to try it.</p> : (
        <>
          <Table head={["Event", "Status", "Attempts", "Last response", "Created", ""]}>
            {list.items.map((d) => (
              <tr key={d.id}><Td><code className="font-mono text-xs">{d.event_type}</code><div className="font-mono text-[11px] text-muted">{d.event_id}</div></Td>
                <Td><Badge tone={d.status === "succeeded" ? "ok" : d.status === "failed" ? "bad" : "warn"}>{d.status === "pending" ? "retrying" : d.status}</Badge>{d.next_attempt_at && d.status === "pending" && <div className="text-[11px] text-muted">next {ago(d.next_attempt_at).replace(" ago", "")}</div>}</Td>
                <Td>{d.attempts}</Td><Td className="text-xs">{d.last_status_code ?? d.last_error ?? "—"}</Td><Td className="whitespace-nowrap text-xs">{ago(d.created_at)}</Td>
                <Td className="whitespace-nowrap"><button className="mr-3 text-xs text-accent underline" onClick={async () => setDetail(await api(`/webhook-deliveries/${d.id}`))}>Details</button>
                  <button className="text-xs text-accent underline" onClick={async () => { try { await api(`/webhook-deliveries/${d.id}/replay`, { method: "POST" }); toast.ok("Replay queued"); setTimeout(list.reload, 2500); } catch (e) { toast.error(e as Error); } }}>Replay</button></Td></tr>
            ))}
          </Table>
          <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
        </>
      )}
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Delivery details" wide>
        {detail && <div className="grid gap-4">
          <div><div className="mb-1 text-sm font-semibold">Payload</div><pre className="max-h-64 overflow-auto rounded-lg bg-paper-2 p-3 font-mono text-[11px]">{JSON.stringify(detail.payload, null, 2)}</pre></div>
          <div><div className="mb-1 text-sm font-semibold">Attempts</div>
            <Table head={["Time", "Status", "Duration", "Response"]}>{detail.attempts.map((a: any) => <tr key={a.id}><Td className="text-xs">{fmtDate(a.attempted_at, { dateStyle: "short", timeStyle: "medium" })}</Td><Td>{a.status_code ?? "—"}</Td><Td>{a.duration_ms} ms</Td><Td className="max-w-[300px] truncate font-mono text-[11px]">{a.error ?? a.response_snippet ?? ""}</Td></tr>)}</Table></div>
        </div>}
      </Modal>
    </Card>
  );
}
