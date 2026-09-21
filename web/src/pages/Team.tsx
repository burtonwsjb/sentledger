import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi } from "../lib/hooks";
import { fmtDate } from "../lib/format";
import { Badge, Button, Card, Confirm, CopyField, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Table, Td, useToast } from "../components/ui";

const ROLE_HELP: Record<string, string> = {
  owner: "Everything, including billing, ownership and workspace deletion.",
  admin: "Manage team, settings, API keys, webhooks and integrations. No billing changes.",
  member: "Send messages and manage templates, contacts and files.",
  viewer: "Read-only access to messages, records and exports.",
  billing: "Manage plans, payment methods and invoices; view messages.",
};

export function Team() {
  const { can, role, org, me, refreshMe } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const m = useApi<any>("/members", [org?.id]);
  const [invite, setInvite] = useState(false);
  const [form, setForm] = useState({ email: "", role: "member" });
  const [busy, setBusy] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<any>(null);
  const [remove, setRemove] = useState<any>(null);

  if (m.loading && !m.data) return <Spinner />;
  if (m.error) return <ErrorState error={m.error} retry={m.reload} />;
  const seats = org?.plan?.entitlements?.seats;

  return (
    <>
      <PageHeader title="Team" description={`${m.data.data.length}${seats ? ` of ${seats}` : ""} seats used. Roles control what each person can do.`}
        actions={can("team") && <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setInvite(true)}>Invite</Button>} />
      <div className="grid gap-5">
        <Card pad={false}>
          <Table head={["Member", "Role", "Joined", ""]}>
            {m.data.data.map((x: any) => {
              const p = x.profiles;
              const self = p.id === me?.user?.id;
              return (
                <tr key={p.id}>
                  <Td><div className="font-medium text-ink">{p.full_name || p.email}{self && <span className="ml-1 text-xs text-muted">(you)</span>}</div><div className="text-xs text-muted">{p.email}</div></Td>
                  <Td>{x.role === "owner" || !can("team") || self ? <Badge tone={x.role === "owner" ? "accent" : "muted"}>{x.role}</Badge> : (
                    <Select className="h-8 w-32 text-[13px]" value={x.role} aria-label={`Role for ${p.email}`} onChange={async (e) => { try { await api(`/members/${p.id}`, { method: "PATCH", body: { role: e.target.value } }); m.reload(); toast.ok("Role updated"); } catch (er) { toast.error(er as Error); } }}>
                      {["admin", "member", "viewer", "billing"].map((r) => <option key={r} value={r} disabled={r === "admin" && role !== "owner"}>{r}</option>)}
                    </Select>
                  )}</Td>
                  <Td className="text-xs">{fmtDate(x.created_at, { dateStyle: "medium" })}</Td>
                  <Td className="whitespace-nowrap">
                    {role === "owner" && !self && <button className="mr-3 text-xs text-accent underline" onClick={() => setTransfer(p)}>Make owner</button>}
                    {x.role !== "owner" && (self || can("team")) && <button className="text-xs text-danger underline" onClick={() => setRemove({ ...p, self })}>{self ? "Leave" : "Remove"}</button>}
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
        {m.data.invitations.length > 0 && (
          <Card title="Pending invitations" pad={false}>
            <Table head={["Email", "Role", "Expires", ""]}>
              {m.data.invitations.map((i: any) => (
                <tr key={i.id}><Td>{i.email}</Td><Td>{i.role}</Td><Td className="text-xs">{fmtDate(i.expires_at)}</Td>
                  <Td><button className="text-xs text-danger underline" onClick={async () => { try { await api(`/invitations/${i.id}`, { method: "DELETE" }); m.reload(); } catch (e) { toast.error(e as Error); } }}>Revoke</button></Td></tr>
              ))}
            </Table>
          </Card>
        )}
        <Card title="Roles"><dl className="grid gap-2 text-sm sm:grid-cols-[120px_1fr]">{Object.entries(ROLE_HELP).map(([r, h]) => <div key={r} className="contents"><dt className="font-semibold capitalize text-ink">{r}</dt><dd className="text-ink-2">{h}</dd></div>)}</dl></Card>
      </div>

      <Modal open={invite} onClose={() => { setInvite(false); setDevLink(null); }} title="Invite a teammate" footer={devLink ? <Button variant="primary" onClick={() => { setInvite(false); setDevLink(null); }}>Done</Button> : <><Button variant="ghost" onClick={() => setInvite(false)}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={!form.email} onClick={async () => { setBusy(true); try { const r = await api("/invitations", { body: form }); toast.ok(`Invitation sent to ${form.email}`); m.reload(); if (r.accept_url) setDevLink(r.accept_url); else setInvite(false); setForm({ email: "", role: "member" }); } catch (e) { toast.error(e as Error); } finally { setBusy(false); } }}>Send invitation</Button></>}>
        {devLink ? <div className="grid gap-2"><Notice tone="info">Development mode: invitation link</Notice><CopyField value={devLink} /></div> : (
          <div className="grid gap-4">
            <Field label="Email"><Input type="email" autoFocus value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Role" hint={ROLE_HELP[form.role]}><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{["member", "viewer", "billing", "admin"].map((r) => <option key={r} value={r} disabled={r === "admin" && role !== "owner"}>{r}</option>)}</Select></Field>
          </div>
        )}
      </Modal>
      <Confirm open={Boolean(transfer)} onClose={() => setTransfer(null)} title="Transfer ownership?" confirmLabel="Transfer" danger
        body={`${transfer?.email} will become the owner, with control of billing and workspace deletion. You'll become an admin.`}
        onConfirm={async () => { try { await api("/org/transfer-ownership", { body: { user_id: transfer.id } }); toast.ok("Ownership transferred"); setTransfer(null); await refreshMe(); m.reload(); } catch (e) { toast.error(e as Error); } }} />
      <Confirm open={Boolean(remove)} onClose={() => setRemove(null)} title={remove?.self ? "Leave this workspace?" : `Remove ${remove?.email}?`} confirmLabel={remove?.self ? "Leave" : "Remove"} danger
        body={remove?.self ? "You'll lose access to this workspace's messages and records." : "They'll lose access immediately. Messages they sent remain in the workspace."}
        onConfirm={async () => { try { await api(`/members/${remove.id}`, { method: "DELETE" }); setRemove(null); if (remove.self) { await refreshMe(); nav("/app"); } else m.reload(); } catch (e) { toast.error(e as Error); } }} />
    </>
  );
}
