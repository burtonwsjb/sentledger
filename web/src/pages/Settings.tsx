import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { api, supabase } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi, usePaged } from "../lib/hooks";
import { fmtDate } from "../lib/format";
import { Badge, Button, Card, Confirm, ErrorState, Field, Input, LoadMore, Notice, PageHeader, Select, Spinner, Table, Tabs, Td, Textarea, Toggle, useToast } from "../components/ui";

type Tab = "workspace" | "tracking" | "data" | "audit" | "profile" | "danger";
const TIMEZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

export function Settings() {
  const [sp, setSp] = useSearchParams();
  const { can } = useAuth();
  const tab = (sp.get("tab") as Tab) ?? (can("org") ? "workspace" : "profile");
  const tabs: { value: Tab; label: string }[] = [
    ...(can("org") ? [{ value: "workspace" as Tab, label: "Workspace" }, { value: "tracking" as Tab, label: "Tracking & consent" }, { value: "data" as Tab, label: "Data & fields" }] : []),
    ...(can("audit") ? [{ value: "audit" as Tab, label: "Audit log" }] : []),
    { value: "profile", label: "Your profile" },
    ...(can("billing") ? [{ value: "danger" as Tab, label: "Danger zone" }] : []),
  ];
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs value={tab} onChange={(v) => setSp({ tab: v })} tabs={tabs} />
      {tab === "workspace" && <Workspace />}
      {tab === "tracking" && <Tracking />}
      {tab === "data" && <DataFields />}
      {tab === "audit" && <Audit />}
      {tab === "profile" && <Profile />}
      {tab === "danger" && <Danger />}
    </>
  );
}

function useOrgForm<T extends Record<string, any>>(pick: (o: any) => T) {
  const { org, refreshOrg } = useAuth();
  const toast = useToast();
  const [f, setF] = useState<T>(() => pick(org ?? {}));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (org) setF(pick(org)); }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (body: Partial<T> = f) => {
    setBusy(true);
    try { await api("/org", { method: "PATCH", body }); await refreshOrg(); toast.ok("Settings saved"); } catch (e) { toast.error(e as Error); } finally { setBusy(false); }
  };
  return { f, setF, busy, save, org };
}

function Workspace() {
  const { f, setF, busy, save, org } = useOrgForm((o) => ({ name: o.name ?? "", timezone: o.timezone ?? "UTC", default_reply_to: o.default_reply_to ?? "", logo_url: o.logo_url ?? "" }));
  const branding = org?.plan?.entitlements?.custom_branding;
  return (
    <Card>
      <form className="grid max-w-xl gap-4" onSubmit={(e) => { e.preventDefault(); save({ name: f.name, timezone: f.timezone, default_reply_to: f.default_reply_to || null, ...(branding ? { logo_url: f.logo_url || null } : {}) }); }}>
        <Field label="Workspace name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Timezone"><Select value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Default reply-to" hint="Where replies go when sending as the SentLedger platform sender. Defaults to the person sending."><Input type="email" value={f.default_reply_to} onChange={(e) => setF({ ...f, default_reply_to: e.target.value })} /></Field>
        <Field label="Logo URL" hint={branding ? "Shown on secure-file pages and reports." : "Custom branding is available on Professional and above."}><Input disabled={!branding} value={f.logo_url} onChange={(e) => setF({ ...f, logo_url: e.target.value })} placeholder="https://…/logo.png" /></Field>
        <div><Button variant="primary" type="submit" loading={busy}>Save</Button></div>
      </form>
    </Card>
  );
}

function Tracking() {
  const { f, setF, busy, save } = useOrgForm((o) => ({ tracking_defaults: o.tracking_defaults ?? { open: true, click: true, files: true }, require_tracking_notice: Boolean(o.require_tracking_notice), consent_language: o.consent_language ?? "" }));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Defaults for new messages">
        <Toggle label="Open tracking" checked={f.tracking_defaults.open} onChange={(v) => setF({ ...f, tracking_defaults: { ...f.tracking_defaults, open: v } })} />
        <Toggle label="Link tracking" checked={f.tracking_defaults.click} onChange={(v) => setF({ ...f, tracking_defaults: { ...f.tracking_defaults, click: v } })} />
        <Toggle label="Secure-file view tracking" checked={f.tracking_defaults.files} onChange={(v) => setF({ ...f, tracking_defaults: { ...f.tracking_defaults, files: v } })} />
        <p className="mt-2 text-xs text-muted">Senders can still change these per message.</p>
      </Card>
      <Card title="Tracking notice">
        <Toggle label="Add a tracking notice to every tracked message" description="Recommended where recipients must be told about tracking." checked={f.require_tracking_notice} onChange={(v) => setF({ ...f, require_tracking_notice: v })} />
        <Field label="Notice text" className="mt-3" hint="Shown at the bottom of tracked messages and in the pre-send confirmation."><Textarea maxLength={500} value={f.consent_language} onChange={(e) => setF({ ...f, consent_language: e.target.value })} /></Field>
      </Card>
      <div><Button variant="primary" loading={busy} onClick={() => save()}>Save tracking settings</Button></div>
    </div>
  );
}

function DataFields() {
  const { f, setF, busy, save, org } = useOrgForm((o) => ({ retention_days: o.retention_days ?? 365, custom_field_defs: (o.custom_field_defs ?? []) as any[] }));
  const max = org?.plan?.entitlements?.retention_days;
  return (
    <div className="grid gap-5">
      <Card title="Retention">
        <div className="grid max-w-md gap-3">
          <Field label="Keep message records for (days)" hint={`Older messages and their ledgers are permanently deleted.${max ? ` Your plan allows up to ${max} days.` : ""}`}>
            <Input type="number" min={30} max={max ?? 3650} value={f.retention_days} onChange={(e) => setF({ ...f, retention_days: Number(e.target.value) })} />
          </Field>
          <Notice tone="warn">Export anything you need to keep longer before it reaches the retention limit.</Notice>
        </div>
      </Card>
      <Card title="Custom fields" action={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setF({ ...f, custom_field_defs: [...f.custom_field_defs, { key: "", label: "", type: "text", applies_to: "contact" }] })}>Add field</Button>}>
        <p className="mb-3 text-sm text-ink-2">Define fields for contacts or message metadata — for example <code>claim_number</code>, <code>ro_number</code>, <code>case_id</code>. Industry-specific data without hard-coding.</p>
        {f.custom_field_defs.length === 0 ? <p className="text-sm text-muted">No custom fields yet.</p> : (
          <div className="grid gap-2">{f.custom_field_defs.map((d, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_120px_130px_auto]">
              <Input aria-label="Key" placeholder="claim_number" value={d.key} onChange={(e) => setF({ ...f, custom_field_defs: f.custom_field_defs.map((x, j) => (j === i ? { ...x, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") } : x)) })} />
              <Input aria-label="Label" placeholder="Claim number" value={d.label} onChange={(e) => setF({ ...f, custom_field_defs: f.custom_field_defs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <Select aria-label="Type" value={d.type} onChange={(e) => setF({ ...f, custom_field_defs: f.custom_field_defs.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}>{["text", "number", "date", "boolean"].map((t) => <option key={t}>{t}</option>)}</Select>
              <Select aria-label="Applies to" value={d.applies_to} onChange={(e) => setF({ ...f, custom_field_defs: f.custom_field_defs.map((x, j) => (j === i ? { ...x, applies_to: e.target.value } : x)) })}><option value="contact">Contacts</option><option value="message">Messages</option></Select>
              <button aria-label="Remove field" className="px-2 text-muted hover:text-danger" onClick={() => setF({ ...f, custom_field_defs: f.custom_field_defs.filter((_, j) => j !== i) })}><X className="size-4" /></button>
            </div>
          ))}</div>
        )}
      </Card>
      <div><Button variant="primary" loading={busy} onClick={() => save({ retention_days: f.retention_days, custom_field_defs: f.custom_field_defs.filter((d) => d.key && d.label) })}>Save</Button></div>
    </div>
  );
}

function Audit() {
  const { org } = useAuth();
  const [action, setAction] = useState("");
  const list = usePaged<any>(`/audit-logs?limit=50${action ? `&action=${action}` : ""}&_o=${org?.id}`);
  return (
    <Card pad={false}>
      <div className="border-b border-line-2 p-3"><Select className="w-56" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter actions">
        <option value="">All actions</option>{["message", "member", "api_key", "webhook", "billing", "integration", "file", "org", "domain", "contacts"].map((a) => <option key={a} value={a}>{a.replace("_", " ")}</option>)}
      </Select></div>
      {list.error ? <ErrorState error={list.error} retry={list.reload} /> : list.loading && !list.items.length ? <Spinner /> : !list.items.length ? <p className="px-5 py-6 text-sm text-muted">No audit events yet.</p> : (
        <>
          <Table head={["Time", "Action", "Actor", "Target", "Details"]}>
            {list.items.map((a) => (
              <tr key={a.id}><Td className="whitespace-nowrap text-xs">{fmtDate(a.created_at, { dateStyle: "short", timeStyle: "medium" })}</Td><Td><code className="font-mono text-xs">{a.action}</code></Td>
                <Td className="text-xs">{a.actor?.email ?? (a.actor_api_key_id ? "API key" : "System")}{a.ip && <div className="text-muted">{a.ip}</div>}</Td>
                <Td className="text-xs">{a.target_type ? `${a.target_type} ${String(a.target_id ?? "").slice(0, 12)}` : "—"}</Td>
                <Td className="max-w-[320px] truncate font-mono text-[11px]">{Object.keys(a.data ?? {}).length ? JSON.stringify(a.data) : ""}</Td></tr>
            ))}
          </Table>
          <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
        </>
      )}
    </Card>
  );
}

function Profile() {
  const { me, refreshMe } = useAuth();
  const toast = useToast();
  const u = me?.user ?? {};
  const [f, setF] = useState({ full_name: u.full_name ?? "", timezone: u.timezone ?? "UTC", prefs: u.notification_prefs ?? {} });
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Profile">
        <div className="grid gap-4">
          <Field label="Email"><Input value={u.email ?? ""} disabled /></Field>
          <Field label="Full name"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Timezone"><Select value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <div><div className="mb-1 text-[13px] font-semibold text-ink">Email notifications</div>
            <Toggle label="When a message is opened" checked={Boolean(f.prefs.email_on_open)} onChange={(v) => setF({ ...f, prefs: { ...f.prefs, email_on_open: v } })} />
            <Toggle label="When a link is clicked" checked={Boolean(f.prefs.email_on_click)} onChange={(v) => setF({ ...f, prefs: { ...f.prefs, email_on_click: v } })} />
            <Toggle label="Weekly summary" checked={Boolean(f.prefs.weekly_digest)} onChange={(v) => setF({ ...f, prefs: { ...f.prefs, weekly_digest: v } })} /></div>
          <div><Button variant="primary" loading={busy === "p"} onClick={async () => { setBusy("p"); try { await api("/me", { method: "PATCH", body: { full_name: f.full_name, timezone: f.timezone, notification_prefs: f.prefs }, org: false }); await refreshMe(); toast.ok("Profile saved"); } catch (e) { toast.error(e as Error); } finally { setBusy(null); } }}>Save profile</Button></div>
        </div>
      </Card>
      <Card title="Password">
        <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); if (pw.length < 10) { toast.error("Use at least 10 characters"); return; } setBusy("pw"); const { error } = await supabase.auth.updateUser({ password: pw }); setBusy(null); if (error) toast.error(error.message); else { toast.ok("Password changed"); setPw(""); } }}>
          <Field label="New password" hint="At least 10 characters."><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <div><Button type="submit" loading={busy === "pw"}>Change password</Button></div>
        </form>
      </Card>
    </div>
  );
}

function Danger() {
  const { role, org } = useAuth();
  const toast = useToast();
  const req = useApi<any>("/org/deletion-request", [org?.id]);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const pending = req.data?.data;
  return (
    <Card title="Delete workspace">
      {pending ? (
        <div className="grid gap-3"><Notice tone="bad">Deletion is scheduled for <b>{fmtDate(pending.scheduled_for, { dateStyle: "long" })}</b>. All messages, ledgers, files and contacts will be permanently removed and any subscription cancelled.</Notice>
          <div><Button onClick={async () => { try { await api("/org/deletion-request", { method: "DELETE" }); req.reload(); toast.ok("Deletion cancelled"); } catch (e) { toast.error(e as Error); } }}>Cancel deletion</Button></div></div>
      ) : (
        <div className="grid gap-3 text-sm text-ink-2">
          <p>Deleting a workspace permanently removes every message, evidence ledger, file, contact and API key after a 30-day grace period. Export anything you need first.</p>
          <div><Button variant="danger" disabled={role !== "owner"} onClick={() => setConfirm(true)}>Request deletion</Button>{role !== "owner" && <Badge className="ml-2">owner only</Badge>}</div>
        </div>
      )}
      <Confirm open={confirm} onClose={() => setConfirm(false)} title="Delete this workspace?" danger confirmLabel="Schedule deletion"
        body={<div className="grid gap-3"><p>Type <b>{org?.name}</b> to confirm. You can cancel during the 30-day grace period.</p><Input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Workspace name" /></div>}
        onConfirm={async () => { if (typed !== org?.name) { toast.error("Name doesn't match"); return; } try { await api("/org/deletion-request", { method: "POST" }); setConfirm(false); req.reload(); toast.ok("Deletion scheduled"); } catch (e) { toast.error(e as Error); } }} />
    </Card>
  );
}
