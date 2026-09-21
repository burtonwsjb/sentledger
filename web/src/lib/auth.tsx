import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, savedOrg, setOrg, supabase, type Session } from "./api";

export type Role = "owner" | "admin" | "member" | "viewer" | "billing";
export type OrgSummary = { id: string; name: string; logo_url: string | null; status: string; role: Role };
export type Me = { user: any; organizations: OrgSummary[]; pending_invitations: any[]; features: Record<string, boolean> };
export type Org = any;

const ROLE_CAN: Record<Role, string[]> = {
  owner: ["*"],
  admin: ["send", "edit", "team", "org", "apikeys", "webhooks", "audit", "integrations", "billing:read"],
  member: ["send", "edit", "integrations"],
  viewer: [],
  billing: ["billing:read", "billing"],
};

type Ctx = {
  session: Session | null;
  ready: boolean;
  me: Me | null;
  org: Org | null;
  role: Role | null;
  can: (perm: string) => boolean;
  refreshMe: () => Promise<Me | null>;
  refreshOrg: () => Promise<void>;
  switchOrg: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [org, setOrgState] = useState<Org | null>(null);

  const loadOrg = useCallback(async (id: string | null) => {
    setOrg(id);
    if (!id) { setOrgState(null); return; }
    try { setOrgState(await api("/org")); } catch { setOrgState(null); }
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const m = await api<Me>("/me", { org: false });
      setMe(m);
      const pick = m.organizations.find((o) => o.id === savedOrg()) ?? m.organizations[0] ?? null;
      await loadOrg(pick?.id ?? null);
      return m;
    } catch {
      setMe(null);
      return null;
    }
  }, [loadOrg]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await refreshMe();
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" || event === "USER_UPDATED") void refreshMe();
      if (event === "SIGNED_OUT") { setMe(null); setOrgState(null); setOrg(null); }
    });
    const onUnauthorized = () => void supabase.auth.getSession().then(({ data }) => { if (!data.session) setSession(null); });
    window.addEventListener("sl:unauthorized", onUnauthorized);
    return () => { active = false; sub.subscription.unsubscribe(); window.removeEventListener("sl:unauthorized", onUnauthorized); };
  }, [refreshMe]);

  const role = (org?.role ?? null) as Role | null;
  const can = (perm: string) => {
    if (!role) return false;
    const p = ROLE_CAN[role];
    return p.includes("*") || p.includes(perm);
  };

  return (
    <AuthCtx.Provider value={{
      session, ready, me, org, role, can, refreshMe,
      refreshOrg: () => loadOrg(org?.id ?? null),
      switchOrg: async (id) => { await loadOrg(id); },
      signOut: async () => { await supabase.auth.signOut(); setOrg(null); try { localStorage.removeItem("sl_org"); } catch { /* ignore */ } },
    }}>
      {children}
    </AuthCtx.Provider>
  );
}
