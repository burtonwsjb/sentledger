import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Code2, Inbox, Mail, PenSquare } from "lucide-react";
import { api, cfg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { AuthFrame } from "./Auth";
import { Button, Field, Input, Notice, cx, useToast } from "../components/ui";

const USES = [
  { v: "web", icon: <PenSquare />, title: "Send from the web app", body: "Compose, track and export records right here." },
  { v: "inbox", icon: <Inbox />, title: "Connect my inbox", body: "Send through Gmail or Microsoft 365 so messages appear in your Sent folder." },
  { v: "api", icon: <Code2 />, title: "Integrate with the API", body: "Send and track from your own software." },
] as const;

export function Onboarding() {
  const [sp] = useSearchParams();
  const { me, refreshMe, switchOrg } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [use, setUse] = useState<string>(sp.get("intent") === "api" ? "api" : "web");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const features = cfg().features;

  if (!sp.get("new") && me?.organizations.length && step === 1 && !orgId) return <Navigate to="/app" replace />;

  const create = async () => {
    setLoading(true); setError(null);
    try {
      const org = await api<{ id: string }>("/orgs", { body: { name, intended_use: use, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }, org: false });
      await refreshMe();
      await switchOrg(org.id);
      setOrgId(org.id);
      setStep(3);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };

  const connect = async (p: "gmail" | "microsoft") => {
    try { const r = await api<{ url: string }>(`/integrations/${p}/connect`, { method: "POST" }); location.href = r.url; }
    catch (e) { toast.error(e as Error); }
  };

  return (
    <AuthFrame title={step === 1 ? "Name your workspace" : step === 2 ? "How will you use SentLedger?" : "Your trial has started"}
      subtitle={step === 1 ? "Usually your company or team name. You can change it later." : step === 2 ? "This sets up your first steps. You can use every option later." : "14 days, every feature, no card on file. Here's how to send your first tracked message."}>
      <div className="mb-6 flex gap-1.5" aria-label={`Step ${step} of 3`}>{[1, 2, 3].map((s) => <span key={s} className={cx("h-1 flex-1 rounded-full", s <= step ? "bg-accent" : "bg-line")} />)}</div>
      {error && <Notice tone="bad" className="mb-4">{error}</Notice>}
      {step === 1 && (
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) setStep(2); }} className="grid gap-4">
          <Field label="Workspace name"><Input autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Harbor Auto Body" /></Field>
          <Button variant="primary" type="submit" disabled={!name.trim()}>Continue</Button>
        </form>
      )}
      {step === 2 && (
        <div className="grid gap-3">
          {USES.map((u) => (
            <button key={u.v} type="button" onClick={() => setUse(u.v)} aria-pressed={use === u.v}
              className={cx("flex items-start gap-3 rounded-xl border p-4 text-left transition-colors", use === u.v ? "border-accent bg-accent-soft" : "border-line bg-card hover:bg-paper-2")}>
              <span className="mt-0.5 text-accent [&>svg]:size-5">{u.icon}</span>
              <span><span className="block text-sm font-semibold text-ink">{u.title}</span><span className="block text-sm text-ink-2">{u.body}</span></span>
            </button>
          ))}
          <div className="mt-2 flex gap-2"><Button onClick={() => setStep(1)}>Back</Button><Button variant="primary" className="flex-1" loading={loading} onClick={create}>Start free trial</Button></div>
        </div>
      )}
      {step === 3 && (
        <div className="grid gap-3">
          {use === "inbox" && (
            <>
              <Button variant="primary" icon={<Mail className="size-4" />} disabled={!features.gmail} onClick={() => connect("gmail")}>Connect Gmail</Button>
              <Button icon={<Mail className="size-4" />} disabled={!features.microsoft} onClick={() => connect("microsoft")}>Connect Microsoft 365</Button>
              {!features.gmail && !features.microsoft && <Notice tone="info">Inbox connections are being enabled for your account. You can send from SentLedger now and connect later from Integrations.</Notice>}
            </>
          )}
          {use === "api" && <Button variant="primary" onClick={() => nav("/app/developers?new=1")}>Create an API key</Button>}
          <Button variant={use === "web" ? "primary" : "secondary"} onClick={() => nav("/app/send?first=1")}>Send your first tracked message</Button>
          <Button variant="ghost" onClick={() => nav("/app")}>Go to dashboard</Button>
          <p className="text-xs text-muted">Until you verify your own domain, messages go out as "{name} via SentLedger" with replies coming to you.</p>
        </div>
      )}
    </AuthFrame>
  );
}
