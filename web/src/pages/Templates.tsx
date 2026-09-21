import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Copy, FolderPlus, LayoutTemplate, Search, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi, useDebounced, usePaged } from "../lib/hooks";
import { ago, fmtDate } from "../lib/format";
import { RichEditor } from "../components/Editor";
import { Badge, Button, Card, Confirm, Empty, ErrorState, Field, Input, LoadMore, Modal, PageHeader, Select, Spinner, Table, Td, useToast } from "../components/ui";

export function Templates() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { can, org } = useAuth();
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const dq = useDebounced(q);
  const list = usePaged<any>(`/templates?limit=50${dq ? `&q=${encodeURIComponent(dq)}` : ""}${folder ? `&folder_id=${folder}` : ""}&_o=${org?.id}`);
  const folders = useApi<any>(`/templates?limit=1&_f=${org?.id}`, [org?.id]);
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");

  useEffect(() => { if (sp.get("new")) nav("/app/templates/new", { replace: true }); }, [sp, nav]);

  return (
    <>
      <PageHeader title="Templates" description="Reusable messages with {{merge_fields}}. Every edit creates a new version."
        actions={can("edit") && <><Button icon={<FolderPlus className="size-4" />} onClick={() => setNewFolder(true)}>New folder</Button><Link to="/app/templates/new"><Button variant="primary">New template</Button></Link></>} />
      <Card pad={false}>
        <div className="flex flex-wrap gap-2 border-b border-line-2 p-3">
          <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input className="pl-9" placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search templates" /></div>
          <Select className="w-48" value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder"><option value="">All folders</option>{(folders.data?.folders ?? []).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
        </div>
        {list.error ? <ErrorState error={list.error} retry={list.reload} /> : list.loading && !list.items.length ? <Spinner /> : !list.items.length ? (
          <Empty icon={<LayoutTemplate />} title={dq || folder ? "No templates match" : "No templates yet"} body="Save the messages you send often — supplements, notices, invoices — and fill in the details each time."
            action={can("edit") && !dq ? <Link to="/app/templates/new"><Button variant="primary">Create a template</Button></Link> : undefined} />
        ) : (
          <>
            <Table head={["Name", "Subject", "Fields", "Version", "Used", "Updated"]}>
              {list.items.map((t) => (
                <tr key={t.id} className="hover:bg-paper-2">
                  <Td><Link to={`/app/templates/${t.id}`} className="font-medium text-ink hover:underline">{t.name}</Link>{t.visibility === "private" && <Badge className="ml-2">private</Badge>}<div className="mt-0.5 flex gap-1">{t.tags.map((x: string) => <Badge key={x}>{x}</Badge>)}</div></Td>
                  <Td className="max-w-[300px] truncate">{t.subject}</Td>
                  <Td className="text-xs">{t.variables.length ? t.variables.join(", ") : "—"}</Td>
                  <Td>v{t.version}</Td><Td>{t.use_count}</Td><Td className="whitespace-nowrap text-xs">{ago(t.updated_at)}</Td>
                </tr>
              ))}
            </Table>
            <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
          </>
        )}
      </Card>
      <Modal open={newFolder} onClose={() => setNewFolder(false)} title="New folder" footer={<><Button variant="ghost" onClick={() => setNewFolder(false)}>Cancel</Button>
        <Button variant="primary" disabled={!folderName.trim()} onClick={async () => { try { await api("/template-folders", { body: { name: folderName } }); toast.ok("Folder created"); setNewFolder(false); setFolderName(""); folders.reload(); } catch (e) { toast.error(e as Error); } }}>Create</Button></>}>
        <Field label="Folder name"><Input autoFocus value={folderName} onChange={(e) => setFolderName(e.target.value)} /></Field>
      </Modal>
    </>
  );
}

export function TemplateEditor() {
  const { id } = useParams();
  const isNew = id === "new";
  const nav = useNavigate();
  const toast = useToast();
  const { can, org } = useAuth();
  const t = useApi<any>(isNew ? null : `/templates/${id}`, [id]);
  const folders = useApi<any>(`/templates?limit=1&_f=${org?.id}`, [org?.id]);
  const [form, setForm] = useState({ name: "", subject: "", html: "", tags: "", folder_id: "", visibility: "org" });
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(false);
  const [version, setVersion] = useState<any>(null);

  useEffect(() => {
    if (t.data) setForm({ name: t.data.name, subject: t.data.subject, html: t.data.html, tags: t.data.tags.join(", "), folder_id: t.data.folder_id ?? "", visibility: t.data.visibility });
  }, [t.data]);
  const vars = useMemo(() => [...new Set([...`${form.subject} ${form.html}`.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]))], [form.subject, form.html]);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Give the template a name"); return; }
    setSaving(true);
    const body = { name: form.name, subject: form.subject, html: form.html, tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean), folder_id: form.folder_id || null, visibility: form.visibility };
    try {
      const r = isNew ? await api("/templates", { body }) : await api(`/templates/${id}`, { method: "PATCH", body });
      toast.ok(isNew ? "Template created" : `Saved as v${r.version}`);
      if (isNew) nav(`/app/templates/${r.id}`, { replace: true }); else t.reload();
    } catch (e) { toast.error(e as Error); } finally { setSaving(false); }
  };

  if (!isNew && t.loading && !t.data) return <Spinner />;
  if (t.error) return <ErrorState error={t.error} retry={t.reload} />;
  const readOnly = !can("edit");

  return (
    <>
      <div className="mb-2 text-sm"><Link to="/app/templates" className="text-muted hover:text-ink">← Templates</Link></div>
      <PageHeader title={isNew ? "New template" : form.name || "Template"} description={!isNew && t.data ? `Version ${t.data.version} · used ${t.data.use_count} times` : "Use {{field_name}} anywhere to insert details when sending."}
        actions={<>
          {!isNew && <Link to={`/app/send?template=${id}`}><Button>Use template</Button></Link>}
          {!isNew && can("edit") && <Button icon={<Copy className="size-4" />} onClick={async () => { try { const c = await api(`/templates/${id}/duplicate`, { method: "POST" }); nav(`/app/templates/${c.id}`); toast.ok("Duplicated"); } catch (e) { toast.error(e as Error); } }}>Duplicate</Button>}
          {!readOnly && <Button variant="primary" loading={saving} onClick={save}>Save</Button>}
        </>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card>
          <div className="grid gap-4">
            <Field label="Name"><Input value={form.name} disabled={readOnly} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Supplement request" /></Field>
            <Field label="Subject"><Input value={form.subject} disabled={readOnly} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Supplement request — Claim #{{claim_number}}" /></Field>
            <RichEditor value={form.html} onChange={(html) => setForm((f) => ({ ...f, html }))} placeholder="Hi {{adjuster_name}}, …" />
          </div>
        </Card>
        <div className="grid content-start gap-5">
          <Card title="Settings">
            <div className="grid gap-4">
              <Field label="Folder"><Select value={form.folder_id} disabled={readOnly} onChange={(e) => setForm({ ...form, folder_id: e.target.value })}><option value="">No folder</option>{(folders.data?.folders ?? []).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
              <Field label="Sharing"><Select value={form.visibility} disabled={readOnly} onChange={(e) => setForm({ ...form, visibility: e.target.value })}><option value="org">Whole team</option><option value="private">Only me</option></Select></Field>
              <Field label="Tags" hint="Comma separated"><Input value={form.tags} disabled={readOnly} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></Field>
            </div>
          </Card>
          <Card title="Merge fields">{vars.length ? <div className="flex flex-wrap gap-1.5">{vars.map((v) => <Badge key={v} tone="accent">{`{{${v}}}`}</Badge>)}</div> : <p className="text-sm text-muted">None yet. Type {"{{name}}"} in the subject or body.</p>}</Card>
          {!isNew && t.data?.versions?.length > 0 && (
            <Card title="Version history" pad={false}>
              <ul className="max-h-72 divide-y divide-line-2 overflow-y-auto">{t.data.versions.map((v: any) => (
                <li key={v.id}><button className="flex w-full items-center justify-between px-5 py-2.5 text-left text-sm hover:bg-paper-2" onClick={async () => setVersion(await api(`/templates/${id}/versions/${v.version}`))}>
                  <span className="font-medium text-ink">v{v.version}</span><span className="text-xs text-muted">{fmtDate(v.created_at)}</span></button></li>
              ))}</ul>
            </Card>
          )}
          {!isNew && can("edit") && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDel(true)}>Delete template</Button>}
        </div>
      </div>
      <Modal open={Boolean(version)} onClose={() => setVersion(null)} title={`Version ${version?.version ?? ""}`} wide
        footer={can("edit") && <Button variant="primary" onClick={() => { setForm({ ...form, subject: version.subject, html: version.html }); setVersion(null); toast.info("Loaded — save to create a new version"); }}>Restore this version</Button>}>
        {version && <><p className="mb-2 text-sm"><b>Subject:</b> {version.subject}</p><iframe title="Version preview" sandbox="" className="h-80 w-full rounded-lg border border-line bg-white" srcDoc={`<body style="font:15px/1.55 Arial;padding:12px">${version.html}</body>`} /></>}
      </Modal>
      <Confirm open={del} onClose={() => setDel(false)} title="Delete template?" danger confirmLabel="Delete" body="Messages already sent from this template keep their content. The template will no longer be available."
        onConfirm={async () => { try { await api(`/templates/${id}`, { method: "DELETE" }); toast.ok("Template deleted"); nav("/app/templates"); } catch (e) { toast.error(e as Error); } }} />
    </>
  );
}
