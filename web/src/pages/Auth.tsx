import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { api, supabase } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Logo } from "../components/Shell";
import { Button, Field, Input, Notice, Select, Spinner, useToast } from "../components/ui";

export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => { document.title = `${title} · SentLedger`; }, [title]);
  return (
    <div className="grid min-h-full lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <a href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-ink"><Logo />SentLedger</a>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="font-serif text-3xl font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-2">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-sm text-ink-2">{footer}</div>}
        </div>
      </div>
      <div className="hidden border-l border-line bg-paper-2 lg:flex lg:items-center lg:justify-center lg:p-12">
        <div className="max-w-md">
          <p className="font-serif text-2xl leading-snug text-ink">A clear record of what you sent and what happened next.</p>
          <p className="mt-3 text-sm text-muted">Every message gets a tamper-evident timeline you can export as a PDF, JSON or CSV. Example:</p>
          <ol className="mt-8 space-y-3 text-sm">
            {[["Accepted by provider", "09:14:02"], ["Delivered to mail server", "09:14:05"], ["Opened · desktop", "10:02:47"], ["Secure file viewed", "10:03:15"]].map(([a, t]) => (
              <li key={a} className="flex items-center justify-between rounded-lg border border-line bg-card px-4 py-2.5"><span className="flex items-center gap-2.5"><span className="size-2.5 rounded-full border-2 border-accent" />{a}</span><span className="font-mono text-xs text-muted">{t}</span></li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

const nextPath = (sp: URLSearchParams) => { const n = sp.get("next"); return n && n.startsWith("/app") ? n : "/app"; };

export function Login() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { session, me } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => { if (session && me) nav(nextPath(sp), { replace: true }); }, [session, me, nav, sp]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
    } else {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/app/auth/callback?next=${encodeURIComponent(nextPath(sp))}`, shouldCreateUser: false } });
      if (error) setError(error.message); else setSent(true);
    }
    setLoading(false);
  };

  if (sent) return (
    <AuthFrame title="Check your email" subtitle={<>We sent a sign-in link to <b>{email}</b>. It expires in one hour.</>} footer={<button className="text-accent underline" onClick={() => setSent(false)}>Use a different method</button>}>
      <div className="grid size-12 place-items-center rounded-xl bg-accent-soft text-accent-ink"><MailCheck /></div>
    </AuthFrame>
  );

  return (
    <AuthFrame title="Log in" subtitle="Welcome back to SentLedger." footer={<>New here? <Link className="font-medium text-accent underline" to={`/app/signup${sp.toString() ? `?${sp}` : ""}`}>Start a free trial</Link></>}>
      <form onSubmit={submit} className="grid gap-4">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {mode === "password" && (
          <Field label="Password" hint={<Link to="/app/forgot" className="text-accent underline">Forgot password?</Link>}>
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        <Button variant="primary" type="submit" loading={loading}>{mode === "password" ? "Log in" : "Email me a sign-in link"}</Button>
        <button type="button" className="text-sm text-ink-2 underline" onClick={() => setMode(mode === "password" ? "magic" : "password")}>
          {mode === "password" ? "Sign in with an email link instead" : "Sign in with a password instead"}
        </button>
      </form>
    </AuthFrame>
  );
}

export function Signup() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { session } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => { if (session) nav(`/app/onboarding${sp.get("intent") ? `?intent=${sp.get("intent")}` : ""}`, { replace: true }); }, [session, nav, sp]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password.length < 10) { setError("Use at least 10 characters for your password."); return; }
    setLoading(true); setError(null);
    const { data, error } = await supabase.auth.signUp({
      email: form.email, password: form.password,
      options: { data: { full_name: form.name }, emailRedirectTo: `${location.origin}/app/auth/callback?next=/app/onboarding` },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    if (!data.session) setConfirm(true);
  };

  if (confirm) return (
    <AuthFrame title="Confirm your email" subtitle={<>We sent a confirmation link to <b>{form.email}</b>. Open it to finish creating your account.</>} footer={<Link to="/app/login" className="text-accent underline">Back to log in</Link>}>
      <div className="grid size-12 place-items-center rounded-xl bg-accent-soft text-accent-ink"><MailCheck /></div>
    </AuthFrame>
  );

  return (
    <AuthFrame title="Start your free trial" subtitle="14 days, no card required. Nothing is charged unless you choose a plan." footer={<>Already have an account? <Link className="font-medium text-accent underline" to="/app/login">Log in</Link></>}>
      <form onSubmit={submit} className="grid gap-4">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="Full name"><Input autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Work email"><Input type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password" hint="At least 10 characters."><Input type="password" autoComplete="new-password" required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Button variant="primary" type="submit" loading={loading}>Create account</Button>
        <p className="text-xs text-muted">By creating an account you agree to the <a className="underline" href="/legal/terms">Terms</a>, <a className="underline" href="/legal/acceptable-use">Acceptable Use Policy</a> and <a className="underline" href="/legal/privacy">Privacy Policy</a>.</p>
      </form>
    </AuthFrame>
  );
}

export function Forgot() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/app/reset-password` });
    setLoading(false);
    if (error) setError(error.message); else setSent(true);
  };
  return (
    <AuthFrame title="Reset your password" subtitle={sent ? <>If an account exists for <b>{email}</b>, a reset link is on its way.</> : "We'll email you a link to choose a new password."} footer={<Link to="/app/login" className="text-accent underline">Back to log in</Link>}>
      {!sent && <form onSubmit={submit} className="grid gap-4">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Button variant="primary" type="submit" loading={loading}>Send reset link</Button>
      </form>}
    </AuthFrame>
  );
}

export function ResetPassword() {
  const nav = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("code");
    (code ? supabase.auth.exchangeCodeForSession(code) : supabase.auth.getSession()).finally(() => setReady(true));
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 10) { setError("Use at least 10 characters."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) setError(error.message);
    else { toast.ok("Password updated"); nav("/app"); }
  };
  if (!ready) return <Spinner />;
  return (
    <AuthFrame title="Choose a new password">
      <form onSubmit={submit} className="grid gap-4">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="New password" hint="At least 10 characters."><Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button variant="primary" type="submit" loading={loading}>Update password</Button>
      </form>
    </AuthFrame>
  );
}

export function AuthCallback() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const code = sp.get("code");
    const err = sp.get("error_description");
    if (err) { setError(err); return; }
    (async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { setError(error.message); return; }
      }
      nav(nextPath(sp), { replace: true });
    })();
  }, [nav, sp]);
  return error
    ? <AuthFrame title="Link problem" subtitle={error} footer={<Link to="/app/login" className="text-accent underline">Back to log in</Link>}><span /></AuthFrame>
    : <Spinner label="Signing you in" />;
}

export function AcceptInvite() {
  const { token } = useParams();
  const { session, refreshMe, switchOrg } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!session) return (
    <AuthFrame title="You're invited" subtitle="Log in or create an account with the email address the invitation was sent to.">
      <div className="grid gap-3">
        <Link to={`/app/login?next=/app/invite/${token}`}><Button variant="primary" className="w-full">Log in to accept</Button></Link>
        <Link to={`/app/signup?next=/app/invite/${token}`}><Button className="w-full">Create an account</Button></Link>
      </div>
    </AuthFrame>
  );
  return (
    <AuthFrame title="Join workspace" subtitle="Accept this invitation to join your team on SentLedger.">
      {error && <Notice tone="bad" className="mb-4">{error}</Notice>}
      <Button variant="primary" className="w-full" loading={loading} onClick={async () => {
        setLoading(true); setError(null);
        try {
          const r = await api<{ org_id: string }>("/invitations/accept", { body: { token }, org: false });
          await refreshMe();
          await switchOrg(r.org_id);
          nav("/app");
        } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
      }}>Accept invitation</Button>
    </AuthFrame>
  );
}

export function DeviceApprove() {
  const [sp] = useSearchParams();
  const { me, org } = useAuth();
  const [code, setCode] = useState(sp.get("code") ?? "");
  const [orgId, setOrgId] = useState(org?.id ?? "");
  const [state, setState] = useState<"idle" | "loading" | "done" | "denied">("idle");
  const [error, setError] = useState<string | null>(null);
  const decide = async (approve: boolean) => {
    setState("loading"); setError(null);
    try {
      await api("/device/approve", { body: { user_code: code, org_id: orgId, approve }, org: false });
      setState(approve ? "done" : "denied");
    } catch (e) { setError((e as Error).message); setState("idle"); }
  };
  if (state === "done") return <AuthFrame title="Extension connected" subtitle="You can close this tab and return to the extension."><span /></AuthFrame>;
  if (state === "denied") return <AuthFrame title="Request denied" subtitle="The extension was not connected."><span /></AuthFrame>;
  return (
    <AuthFrame title="Connect an extension" subtitle="Enter the code shown by the SentLedger extension or integration. It will be able to send messages and read message records in the workspace you choose.">
      <div className="grid gap-4">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="Code"><Input className="font-mono uppercase tracking-widest" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-EFGH" /></Field>
        <Field label="Workspace"><Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>{me?.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <div className="flex gap-2"><Button variant="primary" className="flex-1" loading={state === "loading"} disabled={!code || !orgId} onClick={() => decide(true)}>Approve</Button><Button onClick={() => decide(false)}>Deny</Button></div>
      </div>
    </AuthFrame>
  );
}
