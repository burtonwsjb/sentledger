import { Suspense, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Building2, ChevronDown, Code2, CreditCard, FileLock2, HelpCircle, Inbox, LayoutDashboard, LifeBuoy, LogOut, Menu, PenSquare, Plug, Settings, Shield, Users, UsersRound, LayoutTemplate, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Spinner, cx } from "./ui";

export const Logo = ({ className = "size-7" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <rect x="3" y="3" width="26" height="26" rx="7" fill="var(--accent)" />
    <path d="M9 11h10M9 16h7M9 21h5" stroke="var(--paper)" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M18.5 20.5l2.6 2.6 5-5.4" stroke="var(--paper)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const NAV: { to: string; label: string; icon: ReactNode; perm?: string }[] = [
  { to: "/app", label: "Dashboard", icon: <LayoutDashboard /> },
  { to: "/app/send", label: "Send", icon: <PenSquare />, perm: "send" },
  { to: "/app/messages", label: "Messages", icon: <Inbox /> },
  { to: "/app/templates", label: "Templates", icon: <LayoutTemplate /> },
  { to: "/app/contacts", label: "Contacts", icon: <UsersRound /> },
  { to: "/app/files", label: "Secure Files", icon: <FileLock2 /> },
  { to: "/app/analytics", label: "Analytics", icon: <BarChart3 /> },
  { to: "/app/developers", label: "API & Webhooks", icon: <Code2 /> },
  { to: "/app/integrations", label: "Integrations", icon: <Plug /> },
  { to: "/app/team", label: "Team", icon: <Users /> },
  { to: "/app/billing", label: "Billing", icon: <CreditCard /> },
  { to: "/app/settings", label: "Settings", icon: <Settings /> },
  { to: "/app/help", label: "Help", icon: <HelpCircle /> },
];

export function Shell() {
  const { me, org, switchOrg, signOut, can } = useAuth();
  const [open, setOpen] = useState(false);
  const [orgMenu, setOrgMenu] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const plan = org?.plan;
  const trialDays = plan?.status === "trialing" && plan.trialEndsAt ? Math.max(0, Math.ceil((new Date(plan.trialEndsAt).getTime() - Date.now()) / 86_400_000)) : null;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <Link to="/app" className="flex items-center gap-2.5 text-[17px] font-bold tracking-tight text-ink"><Logo />SentLedger</Link>
        <button className="ml-auto rounded-md p-1 text-muted lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
      </div>
      <div className="relative px-3">
        <button onClick={() => setOrgMenu((v) => !v)} aria-expanded={orgMenu}
          className="flex w-full items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-left text-sm hover:bg-paper-2">
          <Building2 className="size-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate font-medium text-ink">{org?.name ?? "Workspace"}</span>
          <ChevronDown className="size-4 text-muted" />
        </button>
        {orgMenu && (
          <div className="absolute left-3 right-3 z-20 mt-1 rounded-lg border border-line bg-card p-1 shadow-lg">
            {me?.organizations.map((o) => (
              <button key={o.id} onClick={async () => { setOrgMenu(false); await switchOrg(o.id); nav("/app"); }}
                className={cx("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-paper-2", o.id === org?.id && "font-semibold")}>
                <span className="truncate">{o.name}</span><span className="text-xs text-muted">{o.role}</span>
              </button>
            ))}
            <Link to="/app/onboarding?new=1" onClick={() => setOrgMenu(false)} className="block rounded-md px-3 py-2 text-sm text-accent hover:bg-paper-2">+ New workspace</Link>
          </div>
        )}
      </div>
      <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/app"} onClick={() => setOpen(false)}
            className={({ isActive }) => cx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm [&>svg]:size-[18px]", isActive ? "bg-accent-soft font-semibold text-accent-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink")}>
            {n.icon}{n.label}
          </NavLink>
        ))}
        {me?.user?.is_platform_admin && (
          <NavLink to="/app/admin" onClick={() => setOpen(false)} className={({ isActive }) => cx("mt-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm [&>svg]:size-[18px]", isActive ? "bg-gold-soft font-semibold text-gold" : "text-ink-2 hover:bg-paper-2")}>
            <Shield />Platform admin
          </NavLink>
        )}
      </nav>
      <div className="border-t border-line-2 p-3">
        <Link to="/app/settings?tab=profile" className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-paper-2">
          <div className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">{(me?.user?.full_name || me?.user?.email || "?").slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-ink">{me?.user?.full_name || "Your profile"}</div><div className="truncate text-xs text-muted">{me?.user?.email}</div></div>
        </Link>
        <button onClick={async () => { await signOut(); nav("/app/login"); }} className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-paper-2"><LogOut className="size-4" />Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-paper lg:block">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cx("fixed inset-y-0 left-0 z-50 w-72 border-r border-line bg-paper transition-transform lg:hidden", open ? "translate-x-0" : "-translate-x-full")} aria-hidden={!open}>{sidebar}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5 text-ink" aria-label="Open menu"><Menu className="size-5" /></button>
          <Link to="/app" className="flex items-center gap-2 font-bold"><Logo className="size-6" />SentLedger</Link>
        </div>
        {org?.status === "suspended" && <div className="bg-danger-soft px-4 py-2 text-center text-sm text-danger">This workspace is suspended{org.suspended_reason ? `: ${org.suspended_reason}` : ""}. Sending is disabled. <a className="underline" href="/contact?topic=support">Contact support</a>.</div>}
        {plan && !plan.canSend && org?.status !== "suspended" && (
          <div className="bg-gold-soft px-4 py-2 text-center text-sm text-ink-2">{plan.reason} {can("billing") && <Link to="/app/billing" className="font-semibold text-accent underline">Choose a plan</Link>}</div>
        )}
        {trialDays !== null && plan?.canSend && loc.pathname !== "/app/billing" && (
          <div className="border-b border-line-2 bg-accent-soft px-4 py-1.5 text-center text-[13px] text-accent-ink">
            Free trial · {trialDays} day{trialDays === 1 ? "" : "s"} left. {can("billing") && <Link to="/app/billing" className="font-semibold underline">See plans</Link>}
          </div>
        )}
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><Suspense fallback={<Spinner />}><Outlet /></Suspense></main>
        <footer className="px-8 pb-6 text-xs text-muted">
          <LifeBuoy className="mr-1 inline size-3.5" />Need help? <a className="underline" href="mailto:support@sentledger.com">support@sentledger.com</a> · Tracked events are technical records, not proof of reading.
        </footer>
      </div>
    </div>
  );
}
