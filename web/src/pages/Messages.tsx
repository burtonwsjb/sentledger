import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, Archive, Ban, Copy, Download, FileLock2, FileText, Inbox, Mail, MousePointerClick, RotateCcw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { api, download } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi, useDebounced, usePaged } from "../lib/hooks";
import { EVENT_HELP, EVENT_LABEL, STATUS_TONE, ago, bytes, fmtDate, titleCase } from "../lib/format";
import { Badge, Button, Card, Confirm, Empty, ErrorState, Input, LoadMore, Notice, PageHeader, Select, Spinner, Table, Td, Tabs, cx, useToast } from "../components/ui";

export function Messages() {
  const [sp, setSp] = useSearchParams();
  const { org, can } = useAuth();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const dq = useDebounced(q, 300);
  const status = sp.get("status") ?? "";
  const activity = sp.get("activity") ?? "";
  const source = sp.get("source") ?? "";
  const archived = sp.get("archived") ?? "";
  const tag = sp.get("tag") ?? "";
  const metaKey = sp.get("mk") ?? "";
  const metaVal = sp.get("mv") ?? "";
  const path = useMemo(() => {
    const p = new URLSearchParams({ limit: "25" });
    if (dq) p.set("q", dq);
    if (status) p.set("status", status);
    if (activity) p.set("activity", activity);
    if (source) p.set("source", source);
    if (archived) p.set("archived", archived);
    if (tag) p.set("tag", tag);
    if (metaKey && metaVal) p.set(`metadata[${metaKey}]`, metaVal);
    return `/messages?${p}`;
  }, [dq, status, activity, source, archived, tag, metaKey, metaVal, org?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = usePaged<any>(path);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  const filtered = Boolean(dq || status || activity || source || archived || tag || metaVal);

  return (
    <>
      <PageHeader title="Messages" description="Every message and its latest activity. Open one to see the full evidence timeline."
        actions={can("send") && <Link to="/app/send"><Button variant="primary">Send message</Button></Link>} />
      <Card pad={false}>
        <div className="flex flex-wrap gap-2 border-b border-line-2 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search subject or recipient" value={q} onChange={(e) => { setQ(e.target.value); set("q", e.target.value); }} aria-label="Search messages" />
          </div>
          <Select className="w-40" value={status} onChange={(e) => set("status", e.target.value)} aria-label="Status">
            <option value="">Any status</option><option value="draft">Drafts</option><option value="scheduled">Scheduled</option><option value="queued,sending">Sending</option>
            <option value="sent">Sent</option><option value="partially_failed">Partially failed</option><option value="failed">Failed</option>
          </Select>
          <Select className="w-40" value={activity} onChange={(e) => set("activity", e.target.value)} aria-label="Activity">
            <option value="">Any activity</option><option value="opened">Opened</option><option value="not_opened">Not opened</option><option value="clicked">Clicked</option><option value="file_viewed">File viewed</option><option value="bounced">Bounced</option>
          </Select>
          <Select className="w-32" value={source} onChange={(e) => set("source", e.target.value)} aria-label="Source">
            <option value="">Any source</option><option value="web">Web app</option><option value="api">API</option><option value="extension">Extension</option>
          </Select>
          <Input className="w-32" placeholder="Tag" value={tag} onChange={(e) => set("tag", e.target.value)} aria-label="Tag" />
          <Input className="w-28" placeholder="meta key" value={metaKey} onChange={(e) => set("mk", e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} aria-label="Metadata key" />
          <Input className="w-32" placeholder="value" value={metaVal} onChange={(e) => set("mv", e.target.value)} aria-label="Metadata value" />
          <Select className="w-32" value={archived} onChange={(e) => set("archived", e.target.value)} aria-label="Archived">
            <option value="">Active</option><option value="true">Archived</option>
          </Select>
        </div>
        {list.error ? <ErrorState error={list.error} retry={list.reload} /> : list.loading && !list.items.length ? <Spinner /> : !list.items.length ? (
          <Empty icon={<Inbox />} title={filtered ? "No messages match these filters" : "No messages yet"} body={filtered ? "Try clearing a filter." : "Messages you send from the app or API will appear here."}
            action={!filtered && can("send") ? <Link to="/app/send"><Button variant="primary">Send your first message</Button></Link> : filtered ? <Button onClick={() => { setQ(""); setSp(new URLSearchParams(), { replace: true }); }}>Clear filters</Button> : undefined} />
        ) : (
          <>
            <Table head={["Recipients", "Subject", "Status", "Activity", "Sent", ""]}>
              {list.items.map((m) => {
                const r = m.message_recipients ?? [];
                const opened = r.filter((x: any) => x.open_count > 0).length;
                const clicked = r.filter((x: any) => x.click_count > 0).length;
                const files = r.filter((x: any) => x.file_view_count > 0).length;
                const bounced = r.filter((x: any) => x.status === "bounced").length;
                return (
                  <tr key={m.id} className="hover:bg-paper-2">
                    <Td className="max-w-[220px]"><Link to={m.status === "draft" ? `/app/send?draft=${m.id}` : `/app/messages/${m.id}`} className="block truncate font-medium text-ink hover:underline">{r[0]?.email ?? "—"}</Link>{r.length > 1 && <span className="text-xs text-muted">+{r.length - 1} more</span>}</Td>
                    <Td className="max-w-[320px]"><div className="truncate text-ink">{m.subject || <i className="text-muted">(no subject)</i>}</div><div className="flex flex-wrap gap-1">{m.tags.slice(0, 3).map((t: string) => <Badge key={t}>{t}</Badge>)}{m.source !== "web" && <Badge tone="accent">{m.source}</Badge>}</div></Td>
                    <Td><Badge tone={STATUS_TONE[m.status]}>{titleCase(m.status)}</Badge>{m.revoked_at && <Badge tone="bad" className="ml-1">Revoked</Badge>}</Td>
                    <Td className="whitespace-nowrap text-xs">
                      {m.status === "draft" || m.status === "scheduled" ? <span className="text-muted">{m.scheduled_at ? `for ${fmtDate(m.scheduled_at)}` : "—"}</span> : (
                        <span className="flex flex-wrap gap-2">
                          <span className={opened ? "text-accent" : "text-muted"} title="Recipients with an open"><Mail className="mr-0.5 inline size-3.5" />{opened}/{r.length}</span>
                          <span className={clicked ? "text-gold" : "text-muted"} title="Recipients who clicked"><MousePointerClick className="mr-0.5 inline size-3.5" />{clicked}</span>
                          {files > 0 && <span className="text-accent" title="Recipients who viewed a file"><FileLock2 className="mr-0.5 inline size-3.5" />{files}</span>}
                          {bounced > 0 && <span className="text-danger" title="Bounced"><AlertTriangle className="mr-0.5 inline size-3.5" />{bounced}</span>}
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{ago(m.sent_at ?? m.created_at)}</Td>
                    <Td><Link to={m.status === "draft" ? `/app/send?draft=${m.id}` : `/app/messages/${m.id}`} className="text-xs font-medium text-accent">{m.status === "draft" ? "Edit" : "Open"}</Link></Td>
                  </tr>
                );
              })}
            </Table>
            <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
          </>
        )}
      </Card>
    </>
  );
}

// ======================= Message detail =======================
const dotTone = (e: any) => (e.type.match(/bounced|failed|complained/) ? "border-danger" : e.uncertain || e.is_proxy ? "border-gold" : e.type.match(/opened|clicked|file|delivered|sent/) ? "border-accent" : "border-line");

export function MessageDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { can, role } = useAuth();
  const { data: m, error, loading, reload } = useApi<any>(`/messages/${id}`, [id]);
  const [tab, setTab] = useState<"timeline" | "content" | "recipients" | "details">("timeline");
  const [recipient, setRecipient] = useState("");
  const [showDup, setShowDup] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "revoke" | "delete" | "resend">(null);

  if (loading && !m) return <Spinner />;
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!m) return null;

  const rById = new Map(m.message_recipients.map((r: any) => [r.id, r]));
  const events = (m.events as any[]).filter((e) => (showDup || !e.is_duplicate) && (!recipient || e.recipient_id === recipient || !e.recipient_id));
  const act = async (name: string, fn: () => Promise<any>, ok: string) => {
    setBusy(name);
    try { const r = await fn(); toast.ok(ok); return r; } catch (e) { toast.error(e as Error); } finally { setBusy(null); setConfirm(null); }
  };
  const exportAs = (fmt: string) => act(`export-${fmt}`, async () => { await download(`/messages/${m.id}/evidence?format=${fmt}`, `sentledger-${m.id.slice(0, 8)}.${fmt}`); await reload(); }, "Export downloaded");
  const sentEvents = (m.events as any[]).filter((e) => e.type === "message.sent");

  return (
    <>
      <div className="mb-2 text-sm"><Link to="/app/messages" className="text-muted hover:text-ink">← Messages</Link></div>
      <PageHeader title={m.subject || "(no subject)"}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[m.status]}>{titleCase(m.status)}</Badge>{m.revoked_at && <Badge tone="bad">Revoked {ago(m.revoked_at)}</Badge>}{m.archived_at && <Badge>Archived</Badge>}
          <span>From {m.from_name ? `${m.from_name} ` : ""}&lt;{m.from_email}&gt; · {m.sent_at ? `sent ${fmtDate(m.sent_at)}` : `created ${fmtDate(m.created_at)}`}</span></span>}
        actions={<>
          <Button icon={<Download className="size-4" />} loading={busy === "export-pdf"} onClick={() => exportAs("pdf")}>PDF report</Button>
          <Button variant="primary" icon={<ShieldCheck className="size-4" />} loading={busy === "export-zip"} onClick={() => exportAs("zip")}>Evidence package</Button>
        </>} />

      {m.status === "failed" && m.error && <Notice tone="bad" className="mb-4">{m.error}</Notice>}
      {m.send_via !== "managed" && m.send_via !== "platform" && m.status !== "draft" && <Notice tone="info" className="mb-4">Sent through a connected {m.send_via === "gmail" ? "Gmail" : "Microsoft 365"} account. That provider doesn't report delivery or bounces to SentLedger, so those events won't appear here.</Notice>}

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card pad={false}>
          <div className="px-5 pt-3"><Tabs value={tab} onChange={setTab} tabs={[{ value: "timeline", label: "Evidence timeline" }, { value: "recipients", label: `Recipients (${m.message_recipients.length})` }, { value: "content", label: "Content" }, { value: "details", label: "Details" }]} /></div>
          {tab === "timeline" && (
            <div className="px-5 pb-5">
              <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
                {m.message_recipients.length > 1 && <Select className="h-8 w-56 text-[13px]" value={recipient} onChange={(e) => setRecipient(e.target.value)} aria-label="Filter by recipient"><option value="">All recipients</option>{m.message_recipients.map((r: any) => <option key={r.id} value={r.id}>{r.email}</option>)}</Select>}
                <label className="flex items-center gap-2 text-[13px] text-ink-2"><input type="checkbox" checked={showDup} onChange={(e) => setShowDup(e.target.checked)} />Show repeated events</label>
              </div>
              <ol className="relative">
                {events.map((e, i) => (
                  <li key={e.id} className="relative grid grid-cols-[20px_1fr] gap-3 pb-5">
                    {i < events.length - 1 && <span className="absolute left-[9px] top-6 bottom-0 w-px bg-line" aria-hidden />}
                    <span className={cx("mt-1 size-[18px] rounded-full border-2 bg-card", dotTone(e))} aria-hidden />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                        <div className="text-sm font-semibold text-ink">{EVENT_LABEL[e.type] ?? e.type}{e.recipient_id && <span className="font-normal text-ink-2"> · {(rById.get(e.recipient_id) as any)?.email}</span>}</div>
                        <time className="font-mono text-xs text-muted" dateTime={e.occurred_at}>{fmtDate(e.occurred_at, { dateStyle: "medium", timeStyle: "medium" })}</time>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                        <span>{e.source}</span>
                        {e.device && <span>{e.device}</span>}
                        {e.ip_truncated && <span>network {e.ip_truncated}</span>}
                        {e.data?.url && <span className="max-w-[360px] truncate" title={e.data.url}>→ {e.data.url}</span>}
                        {e.data?.file_name && <span>{e.data.file_name}</span>}
                        {e.data?.provider_message_id && <span>provider id {String(e.data.provider_message_id).slice(0, 18)}</span>}
                        {e.data?.error && <span className="text-danger">{e.data.error}</span>}
                        {e.data?.delivered_html_sha256 && <span className="font-mono">delivered html {e.data.delivered_html_sha256.slice(0, 12)}…</span>}
                      </div>
                      {(e.uncertain || e.is_proxy || e.is_duplicate) && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {e.is_proxy && <Badge tone="warn">privacy proxy</Badge>}
                          {e.uncertain && <Badge tone="warn" className="cursor-help" >uncertain{e.data?.reasons?.length ? `: ${e.data.reasons.join(", ").replace(/_/g, " ")}` : ""}</Badge>}
                          {e.is_duplicate && <Badge>repeat</Badge>}
                        </div>
                      )}
                      {EVENT_HELP[e.type] && i === events.findIndex((x) => x.type === e.type) && <p className="mt-1 text-xs text-muted">{EVENT_HELP[e.type]}</p>}
                      <div className="mt-1 font-mono text-[10.5px] text-muted/80" title={`prev ${e.prev_hash}`}>#{e.seq} · {e.hash?.slice(0, 16)}…</div>
                    </div>
                  </li>
                ))}
              </ol>
              {events.length === 0 && <p className="text-sm text-muted">No events match.</p>}
            </div>
          )}
          {tab === "recipients" && (
            <Table head={["Recipient", "Status", "Opens", "Clicks", "Files", "First open"]}>
              {m.message_recipients.map((r: any) => (
                <tr key={r.id}><Td><div className="font-medium text-ink">{r.email}</div><div className="text-xs text-muted">{r.kind.toUpperCase()}{r.name ? ` · ${r.name}` : ""}</div></Td>
                  <Td><Badge tone={STATUS_TONE[r.status]}>{titleCase(r.status)}</Badge>{r.error && <div className="mt-1 max-w-[220px] text-xs text-danger">{r.error}</div>}</Td>
                  <Td>{r.open_count}</Td><Td>{r.click_count}</Td><Td>{r.file_view_count}</Td><Td className="text-xs">{fmtDate(r.first_opened_at)}</Td></tr>
              ))}
            </Table>
          )}
          {tab === "content" && (
            <div className="px-5 pb-5">
              <p className="mb-3 text-xs text-muted">The canonical content {m.content_frozen_at ? `frozen ${fmtDate(m.content_frozen_at)}` : "(not yet frozen — draft)"}. Each recipient's copy adds tracked links and a tracking image; their fingerprints are recorded on the "Accepted by provider" events.</p>
              <iframe title="Message content" sandbox="" className="h-[460px] w-full rounded-lg border border-line bg-white" srcDoc={`<!doctype html><html><body style="font:15px/1.55 Arial,sans-serif;color:#111;padding:16px;margin:0">${m.html}</body></html>`} />
              <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-ink">Plain-text version</summary><pre className="mt-2 whitespace-pre-wrap rounded-lg bg-paper-2 p-3 font-mono text-xs text-ink-2">{m.text}</pre></details>
            </div>
          )}
          {tab === "details" && (
            <dl className="grid gap-x-6 gap-y-3 px-5 pb-5 text-sm sm:grid-cols-[180px_1fr]">
              {[
                ["Message ID", <code className="font-mono text-xs">{m.id}</code>], ["Correlation ID", <code className="font-mono text-xs">{m.correlation_id}</code>],
                ["Source", m.source], ["Sent via", `${m.send_via}${m.provider ? ` (${m.provider})` : ""}`], ["Provider message ID", m.provider_message_id ?? (sentEvents[0]?.data?.provider_message_id ?? "—")],
                ["Delivery mode", m.delivery_mode === "group" ? "Single group email" : "Individual tracked copies"], ["Reply-to", m.reply_to ?? "—"],
                ["HTML SHA-256", <code className="break-all font-mono text-xs">{m.html_sha256 ?? "—"}</code>], ["Text SHA-256", <code className="break-all font-mono text-xs">{m.text_sha256 ?? "—"}</code>],
                ["Tracking", ["open", "click", "files"].filter((k) => m.tracking[k]).join(", ") || "off"], ["Tags", m.tags.join(", ") || "—"],
                ["Metadata", Object.keys(m.metadata).length ? <code className="font-mono text-xs">{JSON.stringify(m.metadata)}</code> : "—"],
                ["Idempotency key", m.idempotency_key ?? "—"], ["Links captured", String(m.links?.length ?? 0)],
              ].map(([k, v], i) => <div key={i} className="contents"><dt className="text-muted">{k}</dt><dd className="min-w-0 text-ink">{v}</dd></div>)}
            </dl>
          )}
        </Card>

        <div className="grid content-start gap-5">
          <Card title="Export">
            <div className="grid gap-2">
              <Button icon={<FileText className="size-4" />} loading={busy === "export-pdf"} onClick={() => exportAs("pdf")}>PDF report</Button>
              <Button icon={<Download className="size-4" />} loading={busy === "export-json"} onClick={() => exportAs("json")}>JSON ledger</Button>
              <Button icon={<Download className="size-4" />} loading={busy === "export-csv"} onClick={() => exportAs("csv")}>CSV events</Button>
              <Button variant="primary" icon={<ShieldCheck className="size-4" />} loading={busy === "export-zip"} onClick={() => exportAs("zip")}>Evidence package (.zip)</Button>
            </div>
            <p className="mt-3 text-xs text-muted">The package includes a manifest with SHA-256 fingerprints of each file. Exports are recorded in the timeline and audit log.</p>
          </Card>
          {m.message_attachments?.length > 0 && (
            <Card title="Secure files" pad={false}>
              <ul className="divide-y divide-line-2">{m.message_attachments.map((a: any) => {
                const links = (m.file_links ?? []).filter((l: any) => l.file_id === a.file_id);
                return <li key={a.id} className="px-5 py-3 text-sm"><div className="flex items-center gap-2"><FileLock2 className="size-4 text-accent" /><span className="flex-1 truncate text-ink">{a.name}</span><span className="text-xs text-muted">{bytes(a.size)}</span></div>
                  <div className="mt-1 text-xs text-muted">{links.reduce((s: number, l: any) => s + l.view_count, 0)} views · {links.length} link{links.length === 1 ? "" : "s"}{links.some((l: any) => l.revoked_at) ? " · revoked" : ""}</div></li>;
              })}</ul>
            </Card>
          )}
          {can("send") && (
            <Card title="Actions">
              <div className="grid gap-2">
                {m.status === "draft" && <Link to={`/app/send?draft=${m.id}`}><Button className="w-full" variant="primary">Edit draft</Button></Link>}
                {m.status === "scheduled" && <Button loading={busy === "cancel"} onClick={() => act("cancel", async () => { await api(`/messages/${m.id}/cancel`, { method: "POST" }); await reload(); }, "Schedule cancelled")}>Cancel scheduled send</Button>}
                {!["draft", "scheduled"].includes(m.status) && <Button icon={<RotateCcw className="size-4" />} onClick={() => setConfirm("resend")}>Resend</Button>}
                <Button icon={<Copy className="size-4" />} loading={busy === "dup"} onClick={() => act("dup", async () => { const c = await api(`/messages/${m.id}/duplicate`, { method: "POST" }); nav(`/app/send?draft=${c.id}`); }, "Copied to a new draft")}>Duplicate</Button>
                {!["draft"].includes(m.status) && !m.revoked_at && <Button icon={<Ban className="size-4" />} onClick={() => setConfirm("revoke")}>Revoke links &amp; files</Button>}
                <Button icon={<Archive className="size-4" />} loading={busy === "archive"} onClick={() => act("archive", async () => { await api(`/messages/${m.id}/archive`, { method: "POST" }); await reload(); }, m.archived_at ? "Unarchived" : "Archived")}>{m.archived_at ? "Unarchive" : "Archive"}</Button>
                {(role === "owner" || role === "admin" || m.status === "draft") && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm("delete")}>Delete</Button>}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Confirm open={confirm === "revoke"} onClose={() => setConfirm(null)} title="Revoke access?" confirmLabel="Revoke" danger loading={busy === "revoke"}
        body="Secure-file links and tracked links in this message will stop working for every recipient. The email itself stays in their inbox — SentLedger can't remove delivered mail. This is recorded in the timeline."
        onConfirm={() => act("revoke", async () => { await api(`/messages/${m.id}/revoke`, { method: "POST" }); await reload(); }, "Access revoked")} />
      <Confirm open={confirm === "resend"} onClose={() => setConfirm(null)} title="Resend this message?" confirmLabel="Resend" loading={busy === "resend"}
        body={`A new copy with its own timeline will be sent to ${m.message_recipients.length} recipient${m.message_recipients.length === 1 ? "" : "s"}. The original record is unchanged.`}
        onConfirm={() => act("resend", async () => { const c = await api(`/messages/${m.id}/resend`, { method: "POST" }); nav(`/app/messages/${c.id}`); }, "Resent")} />
      <Confirm open={confirm === "delete"} onClose={() => setConfirm(null)} title="Delete this message?" confirmLabel="Delete" danger loading={busy === "delete"}
        body={m.status === "draft" ? "This draft will be permanently deleted." : "The message will be hidden from lists. Its ledger is kept until your retention period ends, and the deletion is recorded."}
        onConfirm={() => act("delete", async () => { await api(`/messages/${m.id}`, { method: "DELETE" }); nav("/app/messages"); }, "Deleted")} />
    </>
  );
}
