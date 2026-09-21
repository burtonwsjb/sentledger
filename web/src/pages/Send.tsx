import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarClock, Eye, FileLock2, Monitor, Paperclip, Plus, Send as SendIcon, Smartphone, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi, useDebounced } from "../lib/hooks";
import { bytes } from "../lib/format";
import { RichEditor } from "../components/Editor";
import { Badge, Button, Card, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Toggle, useToast } from "../components/ui";

type Addr = { email: string; name?: string | null };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function RecipientInput({ label, value, onChange, autoFocus }: { label: string; value: Addr[]; onChange: (v: Addr[]) => void; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const q = useDebounced(text, 200);
  const { data } = useApi<any>(q.length >= 2 ? `/contacts?q=${encodeURIComponent(q)}&limit=6` : null, [q]);
  const suggestions = (data?.data ?? []).filter((c: any) => !value.some((v) => v.email === c.primary_email));
  const add = (raw: string, name?: string | null) => {
    const parts = raw.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const bad = parts.filter((p) => !EMAIL.test(p));
    const good = parts.filter((p) => EMAIL.test(p) && !value.some((v) => v.email === p));
    if (good.length) onChange([...value, ...good.map((email) => ({ email, name: parts.length === 1 ? name ?? null : null }))]);
    setErr(bad.length ? `Not a valid email: ${bad.join(", ")}` : null);
    setText(bad.join(", "));
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (["Enter", ",", ";", "Tab"].includes(e.key) && text.trim()) { e.preventDefault(); add(text); }
    if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
  };
  return (
    <Field label={label} error={err}>
      <div className="relative">
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
          {value.map((a) => (
            <span key={a.email} className="inline-flex items-center gap-1 rounded-md bg-paper-2 px-2 py-0.5 text-[13px] text-ink">
              {a.name ? `${a.name} <${a.email}>` : a.email}
              <button type="button" onClick={() => onChange(value.filter((x) => x.email !== a.email))} aria-label={`Remove ${a.email}`} className="text-muted hover:text-ink"><X className="size-3.5" /></button>
            </span>
          ))}
          <input className="min-w-[180px] flex-1 bg-transparent px-1 py-1 text-sm text-ink outline-none placeholder:text-muted" value={text} autoFocus={autoFocus}
            onChange={(e) => setText(e.target.value)} onKeyDown={key} onBlur={() => text.trim() && add(text)} placeholder={value.length ? "" : "name@company.com"} aria-label={label} />
        </div>
        {suggestions.length > 0 && text.length >= 2 && (
          <ul className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-line bg-card p-1 shadow-lg" role="listbox">
            {suggestions.map((c: any) => (
              <li key={c.id}><button type="button" onMouseDown={(e) => { e.preventDefault(); add(c.primary_email, c.name); }} className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-paper-2">
                <span className="text-ink">{c.name || c.primary_email}</span> {c.name && <span className="text-muted">{c.primary_email}</span>}{c.company && <span className="text-muted"> · {c.company}</span>}
              </button></li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}

const substitute = (s: string, vars: Record<string, string>) => s.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, k) => vars[k] ?? `{{${k}}}`);
const findVars = (...s: string[]) => [...new Set(s.flatMap((x) => [...x.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]!)))];

export function Send() {
  const { org, can } = useAuth();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const draftId = sp.get("draft");
  const senders = useApi<any>("/senders", [org?.id]);
  const templates = useApi<any>("/templates?limit=100", [org?.id]);
  const files = useApi<any>("/files?limit=100", [org?.id]);

  const [to, setTo] = useState<Addr[]>([]);
  const [cc, setCc] = useState<Addr[]>([]);
  const [bcc, setBcc] = useState<Addr[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [senderId, setSenderId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [tags, setTags] = useState("");
  const [meta, setMeta] = useState<{ k: string; v: string }[]>([]);
  const [tracking, setTracking] = useState({ open: true, click: true, files: true });
  const [mode, setMode] = useState<"individual" | "group">("individual");
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [expires, setExpires] = useState("");
  const [schedule, setSchedule] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [preview, setPreview] = useState<null | "desktop" | "mobile">(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<null | "draft" | "send">(null);
  const [uploading, setUploading] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftId));
  const fileInput = useRef<HTMLInputElement>(null);

  const location = useLocation();
  useEffect(() => { if (org?.tracking_defaults) setTracking(org.tracking_defaults); }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const pre = (location.state as { to?: string } | null)?.to;
    if (pre) setTo([{ email: pre }]);
    const tpl = sp.get("template");
    if (tpl && !draftId) void applyTemplate(tpl);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!draftId) return;
    api(`/messages/${draftId}`).then((m: any) => {
      const by = (k: string) => m.message_recipients.filter((r: any) => r.kind === k).map((r: any) => ({ email: r.email, name: r.name }));
      setTo(by("to")); setCc(by("cc")); setBcc(by("bcc")); setShowCc(by("cc").length + by("bcc").length > 0);
      setSubject(m.subject); setHtml(m.html); setReplyTo(m.reply_to ?? ""); setSenderId(m.sender_identity_id ?? "");
      setTags(m.tags.join(", ")); setMeta(Object.entries(m.metadata ?? {}).map(([k, v]) => ({ k, v: String(v) })));
      setTracking(m.tracking); setMode(m.delivery_mode); setFileIds(m.message_attachments.map((a: any) => a.file_id));
    }).catch((e) => toast.error(e)).finally(() => setLoadingDraft(false));
  }, [draftId]); // eslint-disable-line react-hooks/exhaustive-deps

  const variables = useMemo(() => findVars(subject, html), [subject, html]);
  const recipients = to.length + cc.length + bcc.length;
  const selectedFiles = (files.data?.data ?? []).filter((f: any) => fileIds.includes(f.id));
  const sender = (senders.data?.data ?? []).find((s: any) => s.id === senderId);

  const applyTemplate = async (id: string) => {
    setTemplateId(id);
    if (!id) return;
    try {
      const t = await api(`/templates/${id}`);
      if ((subject || html.replace(/<[^>]+>/g, "").trim()) && !window.confirm("Replace the current subject and body with this template?")) return;
      setSubject(t.subject); setHtml(t.html);
    } catch (e) { toast.error(e as Error); }
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(list)) {
        const form = new FormData();
        form.append("file", f);
        const r = await api("/files", { form });
        if (r.scan_status === "infected") toast.error(`${f.name} failed the malware scan`);
        else setFileIds((ids) => [...ids, r.id]);
      }
      await files.reload();
    } catch (e) { toast.error(e as Error); } finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  };

  const payload = (send: boolean) => ({
    to, cc, bcc, subject: substitute(subject, vars), html: substitute(html, vars), reply_to: replyTo || null,
    sender_identity_id: senderId || null, template_id: templateId || null,
    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    metadata: Object.fromEntries(meta.filter((m) => m.k.trim()).map((m) => [m.k.trim(), m.v])),
    tracking, delivery_mode: mode, file_ids: fileIds, file_expires_at: expires ? new Date(expires).toISOString() : null,
    scheduled_at: send && schedule ? new Date(schedule).toISOString() : null, send,
  });

  const validate = () => {
    if (!to.length && !cc.length && !bcc.length) return "Add at least one recipient.";
    if (!subject.trim()) return "Add a subject.";
    if (!html.replace(/<[^>]+>/g, "").trim() && !fileIds.length) return "Write a message or attach a file.";
    const missing = variables.filter((v) => !vars[v]);
    if (missing.length) return `Fill in merge fields: ${missing.join(", ")}`;
    if (schedule && new Date(schedule) <= new Date()) return "Schedule time must be in the future.";
    return null;
  };

  const save = async (send: boolean) => {
    const err = send ? validate() : (!to.length && !subject ? "Add a recipient or subject before saving." : null);
    if (err) { toast.error(err); return; }
    setBusy(send ? "send" : "draft");
    try {
      let m: any;
      const idem = `web-${crypto.randomUUID()}`;
      if (draftId) {
        const { send: _s, scheduled_at: _sa, template_id: _t, ...patch } = payload(false) as any;
        await api(`/messages/${draftId}`, { method: "PATCH", body: patch });
        m = send ? await api(`/messages/${draftId}/send`, { body: { scheduled_at: payload(true).scheduled_at }, headers: { "Idempotency-Key": idem } }) : { id: draftId };
      } else {
        m = await api("/messages", { body: payload(send), headers: { "Idempotency-Key": idem } });
      }
      toast.ok(send ? (schedule ? "Message scheduled" : "Message queued for delivery") : "Draft saved");
      nav(`/app/messages/${m.id}`);
    } catch (e) { toast.error(e as Error); } finally { setBusy(null); setConfirm(false); }
  };

  if (!can("send")) return <Notice tone="info">Your role can view records but can't send messages. Ask a workspace admin for Member access.</Notice>;
  if (loadingDraft) return <Spinner label="Loading draft" />;

  const trackingOn = tracking.open || tracking.click || tracking.files;
  const previewHtml = substitute(html, vars) || "<p style='color:#888'>(empty message)</p>";

  return (
    <>
      <PageHeader title={draftId ? "Edit draft" : "Send a message"} description={sp.get("first") ? "Send one to yourself first to see how tracking and the evidence timeline work." : "Every message gets its own evidence timeline."}
        actions={<Link to="/app/messages?status=draft"><Button variant="ghost">Drafts</Button></Link>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="grid gap-4">
            <Field label="From" hint={!senderId ? `Sends as "${org?.name} via SentLedger" (${senders.data?.platform_sender?.email ?? "platform sender"}). Replies go to you.` : sender?.kind === "gmail" || sender?.kind === "microsoft" ? "Sends through your connected account and appears in its Sent folder." : undefined}>
              <Select value={senderId} onChange={(e) => setSenderId(e.target.value)}>
                <option value="">{org?.name} via SentLedger (no setup needed)</option>
                {(senders.data?.data ?? []).map((s: any) => (
                  <option key={s.id} value={s.id} disabled={(s.kind === "managed" && s.sender_domains?.status !== "verified") || ((s.kind === "gmail" || s.kind === "microsoft") && s.provider_connections?.status !== "connected")}>
                    {s.name ? `${s.name} <${s.email}>` : s.email} · {s.kind === "managed" ? "your domain" : s.kind === "gmail" ? "Gmail" : "Microsoft 365"}
                  </option>
                ))}
              </Select>
            </Field>
            <RecipientInput label="To" value={to} onChange={setTo} autoFocus={!draftId} />
            {!showCc ? <button type="button" className="-mt-2 justify-self-start text-[13px] text-accent underline" onClick={() => setShowCc(true)}>Add CC / BCC</button> : (
              <div className="grid gap-4 sm:grid-cols-2"><RecipientInput label="CC" value={cc} onChange={setCc} /><RecipientInput label="BCC" value={bcc} onChange={setBcc} /></div>
            )}
            <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
              <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={998} placeholder="Supplement request — Claim #…" /></Field>
              <Field label="Template"><Select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">None</option>{(templates.data?.data ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select></Field>
            </div>
            <RichEditor value={html} onChange={setHtml} placeholder="Write your message…" />
            {variables.length > 0 && (
              <div className="rounded-lg border border-line-2 bg-paper p-3">
                <div className="mb-2 text-[13px] font-semibold text-ink">Merge fields</div>
                <div className="grid gap-3 sm:grid-cols-2">{variables.map((v) => <Field key={v} label={v}><Input value={vars[v] ?? ""} onChange={(e) => setVars({ ...vars, [v]: e.target.value })} /></Field>)}</div>
              </div>
            )}
            <div>
              <div className="mb-2 flex items-center justify-between"><span className="text-[13px] font-semibold text-ink">Secure files</span>
                <div className="flex gap-2">
                  <input ref={fileInput} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
                  <Button size="sm" icon={<Paperclip className="size-4" />} loading={uploading} onClick={() => fileInput.current?.click()}>Upload</Button>
                  {(files.data?.data ?? []).length > 0 && (
                    <Select className="h-8 w-48 text-[13px]" value="" onChange={(e) => e.target.value && setFileIds((ids) => [...new Set([...ids, e.target.value])])} aria-label="Attach an existing file">
                      <option value="">Attach existing…</option>{(files.data?.data ?? []).filter((f: any) => !fileIds.includes(f.id)).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </Select>
                  )}
                </div>
              </div>
              {selectedFiles.length === 0 ? <p className="text-xs text-muted">Files are delivered as secure, trackable links instead of attachments, so you can see when each is opened and revoke access later.</p> : (
                <ul className="grid gap-1.5">{selectedFiles.map((f: any) => (
                  <li key={f.id} className="flex items-center gap-2 rounded-lg border border-line-2 px-3 py-2 text-sm"><FileLock2 className="size-4 text-accent" /><span className="flex-1 truncate">{f.name}</span><span className="text-xs text-muted">{bytes(f.size)}</span>
                    {f.scan_status === "skipped" && <Badge>not scanned</Badge>}
                    <button type="button" onClick={() => setFileIds(fileIds.filter((x) => x !== f.id))} aria-label={`Remove ${f.name}`} className="text-muted hover:text-danger"><Trash2 className="size-4" /></button></li>
                ))}</ul>
              )}
              {fileIds.length > 0 && <Field label="Links expire" className="mt-3 max-w-xs" hint="Optional. Leave empty to keep links active until revoked."><Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>}
            </div>
          </div>
        </Card>

        <div className="grid content-start gap-5">
          <Card title="Tracking">
            <Toggle label="Open tracking" description="Tracking image. Can be blocked, or loaded by privacy proxies." checked={tracking.open} onChange={(v) => setTracking({ ...tracking, open: v })} />
            <Toggle label="Link tracking" description="Links pass through SentLedger before redirecting." checked={tracking.click} onChange={(v) => setTracking({ ...tracking, click: v })} />
            <Toggle label="File view tracking" description="Record when secure files are viewed." checked={tracking.files} onChange={(v) => setTracking({ ...tracking, files: v })} />
            {recipients > 1 && (
              <Field label="Delivery" className="mt-3" hint={mode === "individual" ? "Each recipient gets their own copy, so activity is attributed per person." : "One email to everyone. Recipients see each other; activity can't be attributed to a person."}>
                <Select value={mode} onChange={(e) => setMode(e.target.value as any)}><option value="individual">Individual tracked copies</option><option value="group">Single group email</option></Select>
              </Field>
            )}
          </Card>
          <Card title="Details">
            <div className="grid gap-4">
              <Field label="Reply-to" hint="Optional"><Input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="you@company.com" /></Field>
              <Field label="Tags" hint="Comma separated"><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="claims, supplement" /></Field>
              <div>
                <div className="mb-1.5 flex items-center justify-between"><span className="text-[13px] font-semibold text-ink">Metadata</span><Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setMeta([...meta, { k: "", v: "" }])}>Add</Button></div>
                {meta.length === 0 && <p className="text-xs text-muted">Your own IDs — claim number, case ID, invoice. Searchable and included in exports.</p>}
                <div className="grid gap-2">{meta.map((m, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                    <Input className="h-9" aria-label="Key" placeholder="claim_id" value={m.k} onChange={(e) => setMeta(meta.map((x, j) => (j === i ? { ...x, k: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") } : x)))} />
                    <Input className="h-9" aria-label="Value" value={m.v} onChange={(e) => setMeta(meta.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
                    <button type="button" aria-label="Remove field" onClick={() => setMeta(meta.filter((_, j) => j !== i))} className="px-1 text-muted hover:text-danger"><X className="size-4" /></button>
                  </div>
                ))}</div>
              </div>
            </div>
          </Card>
          <Card>
            <div className="grid gap-2">
              {showSchedule && <Field label="Send at" hint={Intl.DateTimeFormat().resolvedOptions().timeZone}><Input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} /></Field>}
              <Button variant="primary" icon={schedule ? <CalendarClock className="size-4" /> : <SendIcon className="size-4" />} loading={busy === "send"}
                onClick={() => { const err = validate(); if (err) { toast.error(err); return; } setConfirm(true); }}>{schedule ? "Schedule" : "Send now"}</Button>
              <div className="grid grid-cols-2 gap-2">
                <Button loading={busy === "draft"} onClick={() => save(false)}>Save draft</Button>
                <Button icon={<Eye className="size-4" />} onClick={() => setPreview("desktop")}>Preview</Button>
              </div>
              <button type="button" className="text-[13px] text-accent underline" onClick={() => { setShowSchedule(!showSchedule); if (showSchedule) setSchedule(""); }}>{showSchedule ? "Send now instead" : "Schedule for later"}</button>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="Preview" wide>
        <div className="mb-3 flex gap-2">
          <Button size="sm" variant={preview === "desktop" ? "primary" : "secondary"} icon={<Monitor className="size-4" />} onClick={() => setPreview("desktop")}>Desktop</Button>
          <Button size="sm" variant={preview === "mobile" ? "primary" : "secondary"} icon={<Smartphone className="size-4" />} onClick={() => setPreview("mobile")}>Mobile</Button>
        </div>
        <div className="rounded-lg border border-line bg-paper-2 p-3">
          <div className="mx-auto bg-white" style={{ maxWidth: preview === "mobile" ? 375 : "100%" }}>
            <div className="border-b border-gray-200 px-4 py-3 text-sm text-gray-800"><b>{substitute(subject, vars) || "(no subject)"}</b><div className="text-xs text-gray-500">To: {to.map((t) => t.email).join(", ") || "—"}</div></div>
            <iframe title="Message preview" sandbox="" className="h-[420px] w-full" srcDoc={`<!doctype html><html><body style="font:15px/1.55 Arial,sans-serif;color:#111;padding:16px;margin:0">${previewHtml}${selectedFiles.length ? `<table style="margin-top:20px;border:1px solid #e5e7eb;border-radius:8px;width:100%"><tr><td style="padding:10px;font:600 13px Arial;background:#f9fafb">Secure files</td></tr>${selectedFiles.map((f: any) => `<tr><td style="padding:8px 10px;border-top:1px solid #e5e7eb;font:14px Arial">${f.name.replace(/</g, "&lt;")} — <span style="color:#0f5c4d;font-weight:600">View file</span></td></tr>`).join("")}</table>` : ""}${org?.require_tracking_notice && trackingOn ? `<p style="font:12px Arial;color:#6b7280;margin-top:20px">${org.consent_language}</p>` : ""}</body></html>`} />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">Links are rewritten to tracked links at send time. The tracking image is invisible.</p>
      </Modal>

      <Modal open={confirm} onClose={() => setConfirm(false)} title={schedule ? "Schedule this message?" : "Send this message?"}
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" loading={busy === "send"} onClick={() => save(true)}>{schedule ? "Schedule" : `Send to ${recipients} recipient${recipients === 1 ? "" : "s"}`}</Button></>}>
        <div className="grid gap-3 text-sm text-ink-2">
          <p><b className="text-ink">{substitute(subject, vars)}</b> → {[...to, ...cc, ...bcc].map((a) => a.email).join(", ")}</p>
          {schedule && <p>Scheduled for {new Date(schedule).toLocaleString()}.</p>}
          {trackingOn ? (
            <Notice tone="info">
              Tracking is on ({[tracking.open && "opens", tracking.click && "links", tracking.files && "files"].filter(Boolean).join(", ")}).
              {org?.require_tracking_notice ? <> Your workspace adds this notice: <i>"{org.consent_language}"</i></> : " Make sure you're allowed to track these recipients where you and they are located."}
            </Notice>
          ) : <p>Tracking is off for this message. Provider delivery events are still recorded.</p>}
          <p className="text-xs text-muted">Once sent, the content is frozen and fingerprinted. It can't be edited afterwards.</p>
        </div>
      </Modal>
    </>
  );
}

