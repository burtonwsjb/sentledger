import { useRef, useState } from "react";
import { FileLock2, Link2, Search, Trash2, Upload } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi, useDebounced, usePaged } from "../lib/hooks";
import { EVENT_LABEL, ago, bytes, fmtDate } from "../lib/format";
import { Badge, Button, Card, Confirm, CopyField, Empty, ErrorState, Field, Input, LoadMore, Modal, Notice, PageHeader, Spinner, Table, Td, Toggle, useToast } from "../components/ui";

export function Files() {
  const { can, org } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const list = usePaged<any>(`/files?limit=50${dq ? `&q=${encodeURIComponent(dq)}` : ""}&_o=${org?.id}`);
  const usage = useApi<any>(can("billing:read") ? "/usage" : null, [org?.id]);
  const [open, setOpen] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const limitMb = org?.plan?.entitlements?.attachment_storage_mb;

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const form = new FormData(); form.append("file", f);
        const r = await api("/files", { form });
        if (r.scan_status === "infected") toast.error(`${f.name} failed the malware scan and was blocked`); else toast.ok(`${f.name} uploaded`);
      }
      list.reload(); usage.reload();
    } catch (e) { toast.error(e as Error); } finally { setUploading(false); if (input.current) input.current.value = ""; }
  };

  return (
    <>
      <PageHeader title="Secure files" description="Files are stored privately and shared through expiring, revocable links. Every view is recorded."
        actions={can("send") && <><input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} /><Button variant="primary" icon={<Upload className="size-4" />} loading={uploading} onClick={() => input.current?.click()}>Upload files</Button></>} />
      {usage.data && limitMb && <p className="mb-3 text-xs text-muted">{bytes(usage.data.storage_bytes)} of {(limitMb / 1000).toLocaleString()} GB used · max 25 MB per file · executables and scripts are blocked</p>}
      <Card pad={false}>
        <div className="border-b border-line-2 p-3"><div className="relative max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input className="pl-9" placeholder="Search files" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search files" /></div></div>
        {list.error ? <ErrorState error={list.error} retry={list.reload} /> : list.loading && !list.items.length ? <Spinner /> : !list.items.length ? (
          <Empty icon={<FileLock2 />} title="No files yet" body="Upload estimates, photos, contracts or invoices, then attach them to messages or share a standalone secure link." />
        ) : (
          <>
            <Table head={["Name", "Size", "Scan", "Links", "Uploaded", ""]}>
              {list.items.map((f) => (
                <tr key={f.id} className="hover:bg-paper-2">
                  <Td><button className="text-left font-medium text-ink hover:underline" onClick={() => setOpen(f.id)}>{f.name}</button><div className="font-mono text-[11px] text-muted">sha256 {f.sha256.slice(0, 16)}…</div></Td>
                  <Td>{bytes(f.size)}</Td>
                  <Td>{f.scan_status === "clean" ? <Badge tone="ok">clean</Badge> : f.scan_status === "infected" ? <Badge tone="bad">blocked</Badge> : <Badge>not scanned</Badge>}</Td>
                  <Td>{f.file_links?.[0]?.count ?? 0}</Td>
                  <Td className="whitespace-nowrap text-xs">{ago(f.created_at)}</Td>
                  <Td><button className="text-xs font-medium text-accent" onClick={() => setOpen(f.id)}>Manage</button></Td>
                </tr>
              ))}
            </Table>
            <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
          </>
        )}
      </Card>
      {open && <FileModal id={open} onClose={() => { setOpen(null); list.reload(); }} />}
    </>
  );
}

function FileModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const f = useApi<any>(`/files/${id}`, [id]);
  const [expires, setExpires] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  return (
    <Modal open onClose={onClose} title={f.data?.name ?? "File"} wide>
      {f.loading && !f.data ? <Spinner /> : f.error ? <ErrorState error={f.error} retry={f.reload} /> : (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><div className="text-xs text-muted">Size</div>{bytes(f.data.size)}</div><div><div className="text-xs text-muted">Type</div>{f.data.mime}</div>
            <div><div className="text-xs text-muted">Uploaded</div>{fmtDate(f.data.created_at)}</div><div><div className="text-xs text-muted">Scan</div>{f.data.scan_status}</div>
            <div className="col-span-full"><div className="text-xs text-muted">SHA-256</div><code className="break-all font-mono text-xs">{f.data.sha256}</code></div>
          </div>
          {f.data.scan_status === "skipped" && <Notice tone="info">Malware scanning isn't configured for this workspace yet. Only share files you trust.</Notice>}
          {can("send") && (
            <div className="rounded-lg border border-line-2 p-4">
              <div className="mb-3 text-sm font-semibold text-ink">Create a standalone secure link</div>
              <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
                <Field label="Expires" hint="Optional"><Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
                <Button variant="primary" icon={<Link2 className="size-4" />} loading={busy} onClick={async () => {
                  setBusy(true);
                  try { const r = await api(`/files/${id}/links`, { body: { expires_at: expires ? new Date(expires).toISOString() : null, allow_download: allowDownload } }); setCreated(r.url); f.reload(); } catch (e) { toast.error(e as Error); } finally { setBusy(false); }
                }}>Create link</Button>
              </div>
              <Toggle label="Allow download" checked={allowDownload} onChange={setAllowDownload} description="If off, the file opens in the browser instead of downloading." />
              {created && <div className="mt-2"><CopyField value={created} label="Secure link" /><p className="mt-1 text-xs text-muted">Views through standalone links are counted on the link. Attach the file to a message to get per-recipient evidence events.</p></div>}
            </div>
          )}
          <div>
            <div className="mb-2 text-sm font-semibold text-ink">Links</div>
            {f.data.links.length === 0 ? <p className="text-sm text-muted">No links yet.</p> : (
              <Table head={["Recipient", "Views", "Expires", "Status", ""]}>
                {f.data.links.map((l: any) => (
                  <tr key={l.id}><Td>{l.message_recipients?.email ?? (l.message_id ? "Message (group)" : "Standalone link")}</Td><Td>{l.view_count}</Td><Td className="text-xs">{l.expires_at ? fmtDate(l.expires_at) : "Never"}</Td>
                    <Td>{l.revoked_at ? <Badge tone="bad">revoked</Badge> : l.expires_at && new Date(l.expires_at) < new Date() ? <Badge>expired</Badge> : <Badge tone="ok">active</Badge>}</Td>
                    <Td className="whitespace-nowrap">{!l.revoked_at && <><button className="mr-3 text-xs text-accent underline" onClick={() => navigator.clipboard.writeText(l.url).then(() => toast.ok("Link copied"))}>Copy</button>
                      {can("send") && <button className="text-xs text-danger underline" onClick={async () => { try { await api(`/file-links/${l.id}/revoke`, { method: "POST" }); f.reload(); toast.ok("Link revoked"); } catch (e) { toast.error(e as Error); } }}>Revoke</button>}</>}</Td></tr>
                ))}
              </Table>
            )}
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-ink">Recent access</div>
            {f.data.views.length === 0 ? <p className="text-sm text-muted">No recorded views yet.</p> : (
              <ul className="grid gap-1 text-sm">{f.data.views.map((v: any) => <li key={v.id} className="flex justify-between gap-3 border-b border-line-2 py-1.5"><span>{EVENT_LABEL[v.type]} {v.device && <span className="text-muted">· {v.device}</span>} {v.uncertain && <Badge tone="warn">uncertain</Badge>}</span><span className="text-xs text-muted">{fmtDate(v.occurred_at)}</span></li>)}</ul>
            )}
          </div>
          {can("send") && <div className="flex justify-end"><Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDel(true)}>Delete file</Button></div>}
        </div>
      )}
      <Confirm open={del} onClose={() => setDel(false)} title="Delete this file?" danger confirmLabel="Delete" body="All links stop working immediately. Message records keep the file's name, size and fingerprint."
        onConfirm={async () => { try { await api(`/files/${id}`, { method: "DELETE" }); toast.ok("File deleted"); setDel(false); onClose(); } catch (e) { toast.error(e as Error); } }} />
    </Modal>
  );
}
