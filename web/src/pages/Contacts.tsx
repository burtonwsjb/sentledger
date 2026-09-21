import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Download, Search, Trash2, Upload, UsersRound } from "lucide-react";
import { api, download } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi, useDebounced, usePaged } from "../lib/hooks";
import { STATUS_TONE, ago, fmtDate, titleCase } from "../lib/format";
import { Badge, Button, Card, Confirm, Empty, ErrorState, Field, Input, LoadMore, Modal, Notice, PageHeader, Select, Spinner, Table, Tabs, Td, Textarea, Toggle, useToast } from "../components/ui";

export function Contacts() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as "contacts" | "suppressions") ?? "contacts";
  return (
    <>
      <PageHeader title="Contacts" description="People you send to, with their full communication history. Suppressed addresses are skipped automatically." actions={tab === "contacts" ? <ContactActions /> : undefined} />
      <Tabs value={tab} onChange={(v) => setSp(v === "contacts" ? {} : { tab: v })} tabs={[{ value: "contacts", label: "Contacts" }, { value: "suppressions", label: "Suppression list" }]} />
      {tab === "contacts" ? <ContactList /> : <Suppressions />}
    </>
  );
}

function ContactActions() {
  const { can } = useAuth();
  const toast = useToast();
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Button icon={<Download className="size-4" />} onClick={() => download("/contacts-export", "sentledger-contacts.csv").catch((e) => toast.error(e))}>Export CSV</Button>
      {can("edit") && <Button icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>Import CSV</Button>}
      {can("edit") && <Button variant="primary" onClick={() => setAdding(true)}>Add contact</Button>}
      <ImportModal open={importing} onClose={() => setImporting(false)} />
      <ContactModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function ContactList() {
  const { org } = useAuth();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const list = usePaged<any>(`/contacts?limit=50${dq ? `&q=${encodeURIComponent(dq)}` : ""}&_o=${org?.id}`);
  return (
    <Card pad={false}>
      <div className="border-b border-line-2 p-3"><div className="relative max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input className="pl-9" placeholder="Search name, company or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search contacts" /></div></div>
      {list.error ? <ErrorState error={list.error} retry={list.reload} /> : list.loading && !list.items.length ? <Spinner /> : !list.items.length ? (
        <Empty icon={<UsersRound />} title={dq ? "No contacts match" : "No contacts yet"} body="Add contacts one at a time or import a CSV with an email column. Recipients you send to are linked automatically." />
      ) : (
        <>
          <Table head={["Name", "Email", "Company", "Tags", "Added"]}>
            {list.items.map((c) => (
              <tr key={c.id} className="hover:bg-paper-2">
                <Td><Link to={`/app/contacts/${c.id}`} className="font-medium text-ink hover:underline">{c.name || "—"}</Link></Td>
                <Td>{c.primary_email}{c.emails.length > 1 && <span className="text-xs text-muted"> +{c.emails.length - 1}</span>}</Td>
                <Td>{c.company ?? "—"}</Td>
                <Td><div className="flex flex-wrap gap-1">{c.tags.map((t: string) => <Badge key={t}>{t}</Badge>)}</div></Td>
                <Td className="whitespace-nowrap text-xs">{ago(c.created_at)}</Td>
              </tr>
            ))}
          </Table>
          <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
        </>
      )}
    </Card>
  );
}

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [dups, setDups] = useState("skip");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const close = () => { setFile(null); setResult(null); onClose(); if (result) location.reload(); };
  return (
    <Modal open={open} onClose={close} title="Import contacts" footer={result ? <Button variant="primary" onClick={close}>Done</Button> : <><Button variant="ghost" onClick={close}>Cancel</Button>
      <Button variant="primary" disabled={!file} loading={busy} onClick={async () => {
        setBusy(true);
        try { const f = new FormData(); f.append("file", file!); f.append("duplicates", dups); setResult(await api("/contacts/import", { form: f })); } catch (e) { toast.error(e as Error); } finally { setBusy(false); }
      }}>Import</Button></>}>
      {result ? (
        <div className="grid gap-3 text-sm">
          <Notice tone="ok">{result.created} created · {result.updated} updated · {result.skipped_duplicates} skipped as duplicates</Notice>
          {result.errors.length > 0 && <div><div className="mb-1 font-semibold text-ink">{result.errors.length} row{result.errors.length === 1 ? "" : "s"} couldn't be imported</div>
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-line-2 text-xs">{result.errors.map((e: any, i: number) => <li key={i} className="border-b border-line-2 px-3 py-1.5 last:border-0">Row {e.row}: {e.error}</li>)}</ul></div>}
        </div>
      ) : (
        <div className="grid gap-4 text-sm">
          <p className="text-ink-2">CSV with a header row. Required: <code>email</code>. Optional: <code>name</code>, <code>company</code>, <code>tags</code> (separated by <code>;</code>), <code>notes</code>. Any other columns become custom fields.</p>
          <Field label="CSV file"><input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" /></Field>
          <Field label="If a contact already exists"><Select value={dups} onChange={(e) => setDups(e.target.value)}><option value="skip">Skip it</option><option value="update">Update it with the CSV values</option></Select></Field>
        </div>
      )}
    </Modal>
  );
}

function ContactModal({ open, onClose, contact, onSaved }: { open: boolean; onClose: () => void; contact?: any; onSaved?: () => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const { org } = useAuth();
  const defs = (org?.custom_field_defs ?? []).filter((d: any) => d.applies_to === "contact");
  const [f, setF] = useState(() => ({
    name: contact?.name ?? "", company: contact?.company ?? "", primary_email: contact?.primary_email ?? "", other: (contact?.emails ?? []).filter((e: string) => e !== contact?.primary_email).join(", "),
    tags: (contact?.tags ?? []).join(", "), notes: contact?.notes ?? "", tracking: contact?.consent?.tracking ?? true, custom: { ...(contact?.custom ?? {}) } as Record<string, any>,
  }));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const body = {
      name: f.name || null, company: f.company || null, primary_email: f.primary_email, emails: f.other.split(",").map((s: string) => s.trim()).filter(Boolean),
      tags: f.tags.split(",").map((s: string) => s.trim()).filter(Boolean), notes: f.notes || null,
      consent: { ...(contact?.consent ?? {}), tracking: f.tracking, recorded_at: new Date().toISOString(), source: "web_app" }, custom: f.custom,
    };
    try {
      const r = contact ? await api(`/contacts/${contact.id}`, { method: "PATCH", body }) : await api("/contacts", { body });
      toast.ok(contact ? "Contact updated" : "Contact added");
      onClose(); onSaved?.();
      if (!contact) nav(`/app/contacts/${r.id}`);
    } catch (e) { toast.error(e as Error); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={contact ? "Edit contact" : "Add contact"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!f.primary_email} onClick={save}>Save</Button></>}>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="Company"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field></div>
        <Field label="Email"><Input type="email" required value={f.primary_email} onChange={(e) => setF({ ...f, primary_email: e.target.value })} /></Field>
        <Field label="Other emails" hint="Comma separated"><Input value={f.other} onChange={(e) => setF({ ...f, other: e.target.value })} /></Field>
        <Field label="Tags" hint="Comma separated"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
        {defs.map((d: any) => <Field key={d.key} label={d.label}><Input type={d.type === "number" ? "number" : d.type === "date" ? "date" : "text"} value={f.custom[d.key] ?? ""} onChange={(e) => setF({ ...f, custom: { ...f.custom, [d.key]: e.target.value } })} /></Field>)}
        <Field label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <Toggle label="Tracking consent recorded" description="For your records — whether this contact agreed to tracked communications." checked={f.tracking} onChange={(v) => setF({ ...f, tracking: v })} />
      </div>
    </Modal>
  );
}

export function ContactDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const c = useApi<any>(`/contacts/${id}`, [id]);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  if (c.loading && !c.data) return <Spinner />;
  if (c.error) return <ErrorState error={c.error} retry={c.reload} />;
  const ct = c.data;
  return (
    <>
      <div className="mb-2 text-sm"><Link to="/app/contacts" className="text-muted hover:text-ink">← Contacts</Link></div>
      <PageHeader title={ct.name || ct.primary_email} description={[ct.company, ct.primary_email].filter(Boolean).join(" · ")}
        actions={can("edit") && <><Button onClick={() => setEdit(true)}>Edit</Button><Link to={`/app/send`} state={{ to: ct.primary_email }}><Button variant="primary">Send message</Button></Link></>} />
      {ct.suppression && <Notice tone="warn" className="mb-4">This address is suppressed ({ct.suppression.reason}, {fmtDate(ct.suppression.created_at)}). Messages to it will be skipped.</Notice>}
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card title="Communication history" pad={false}>
          {ct.history.length === 0 ? <Empty title="No messages yet" body="Messages sent to any of this contact's addresses appear here." /> : (
            <Table head={["Subject", "Status", "Opens", "Clicks", "Files", "Sent"]}>
              {ct.history.map((h: any) => (
                <tr key={h.id} className="hover:bg-paper-2"><Td><Link className="text-ink hover:underline" to={`/app/messages/${h.messages.id}`}>{h.messages.subject || "(no subject)"}</Link></Td>
                  <Td><Badge tone={STATUS_TONE[h.status]}>{titleCase(h.status)}</Badge></Td><Td>{h.open_count}</Td><Td>{h.click_count}</Td><Td>{h.file_view_count}</Td><Td className="whitespace-nowrap text-xs">{ago(h.messages.sent_at ?? h.created_at)}</Td></tr>
              ))}
            </Table>
          )}
        </Card>
        <div className="grid content-start gap-5">
          <Card title="Details">
            <dl className="grid gap-2 text-sm">
              <div><dt className="text-xs text-muted">Emails</dt><dd>{ct.emails.join(", ")}</dd></div>
              <div><dt className="text-xs text-muted">Tags</dt><dd className="flex flex-wrap gap-1">{ct.tags.length ? ct.tags.map((t: string) => <Badge key={t}>{t}</Badge>) : "—"}</dd></div>
              <div><dt className="text-xs text-muted">Tracking consent</dt><dd>{ct.consent?.tracking === false ? "Not given" : ct.consent?.tracking ? `Recorded ${ct.consent.recorded_at ? fmtDate(ct.consent.recorded_at, { dateStyle: "medium" }) : ""}` : "Not recorded"}</dd></div>
              {Object.entries(ct.custom ?? {}).map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd>{String(v)}</dd></div>)}
              {ct.notes && <div><dt className="text-xs text-muted">Notes</dt><dd className="whitespace-pre-wrap">{ct.notes}</dd></div>}
            </dl>
          </Card>
          {can("edit") && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDel(true)}>Delete contact</Button>}
        </div>
      </div>
      {edit && <ContactModal open={edit} onClose={() => setEdit(false)} contact={ct} onSaved={c.reload} />}
      <Confirm open={del} onClose={() => setDel(false)} title="Delete contact?" danger confirmLabel="Delete" body="Message records are kept. The contact profile is removed."
        onConfirm={async () => { try { await api(`/contacts/${id}`, { method: "DELETE" }); toast.ok("Contact deleted"); nav("/app/contacts"); } catch (e) { toast.error(e as Error); } }} />
    </>
  );
}

function Suppressions() {
  const { can, org } = useAuth();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const list = usePaged<any>(`/suppressions?limit=50${reason ? `&reason=${reason}` : ""}&_o=${org?.id}`);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-end gap-2 border-b border-line-2 p-3">
        <Select className="w-44" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason"><option value="">All reasons</option><option value="unsubscribe">Unsubscribed</option><option value="bounce">Bounced</option><option value="complaint">Spam complaint</option><option value="manual">Manual</option></Select>
        {can("edit") && <form className="ml-auto flex gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await api("/suppressions", { body: { email } }); setEmail(""); toast.ok("Address suppressed"); list.reload(); } catch (er) { toast.error(er as Error); } finally { setBusy(false); } }}>
          <Input type="email" required placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-64" aria-label="Email to suppress" /><Button type="submit" loading={busy}>Suppress</Button>
        </form>}
      </div>
      {list.error ? <ErrorState error={list.error} retry={list.reload} /> : list.loading && !list.items.length ? <Spinner /> : !list.items.length ? <Empty title="No suppressed addresses" body="Unsubscribes, hard bounces and spam complaints are added here automatically." /> : (
        <>
          <Table head={["Email", "Reason", "Note", "Added", ""]}>
            {list.items.map((s) => (
              <tr key={s.id}><Td className="font-medium text-ink">{s.email}</Td><Td><Badge tone={s.reason === "complaint" || s.reason === "bounce" ? "bad" : "muted"}>{s.reason}</Badge></Td><Td className="text-xs">{s.note ?? "—"}</Td><Td className="text-xs">{fmtDate(s.created_at)}</Td>
                <Td>{can("edit") && <button className="text-xs text-danger underline" onClick={async () => { if (!confirm(`Remove ${s.email} from the suppression list? Messages to it will be sent again.`)) return; try { await api(`/suppressions/${s.id}`, { method: "DELETE" }); list.reload(); toast.ok("Removed"); } catch (e) { toast.error(e as Error); } }}>Remove</button>}</Td></tr>
            ))}
          </Table>
          <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
        </>
      )}
    </Card>
  );
}
