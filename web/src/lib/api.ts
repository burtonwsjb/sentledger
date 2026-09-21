import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";

export type Config = { supabaseUrl: string; supabaseAnonKey: string; publicUrl: string; features: { email: boolean; stripe: boolean; gmail: boolean; microsoft: boolean } };

let config: Config | null = null;
export let supabase: SupabaseClient;

export async function loadConfig(): Promise<Config> {
  if (config) return config;
  const r = await fetch("/v1/public/config");
  if (!r.ok) throw new Error("Could not reach SentLedger. Check your connection and reload.");
  config = (await r.json()) as Config;
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } });
  return config;
}
export const cfg = () => config!;

let currentOrg: string | null = null;
export const setOrg = (id: string | null) => {
  currentOrg = id;
  try { if (id) localStorage.setItem("sl_org", id); } catch { /* storage unavailable */ }
};
export const savedOrg = () => { try { return localStorage.getItem("sl_org"); } catch { return null; } };
export const orgId = () => currentOrg;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

type Opts = { method?: string; body?: unknown; form?: FormData; raw?: boolean; headers?: Record<string, string>; org?: boolean };

export async function api<T = any>(path: string, o: Opts = {}): Promise<T> {
  const t = await token();
  const headers: Record<string, string> = { ...(o.headers ?? {}) };
  if (t) headers.Authorization = `Bearer ${t}`;
  if (o.org !== false && currentOrg) headers["X-Org-Id"] = currentOrg;
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(o.body); }
  const res = await fetch(`/v1${path}`, { method: o.method ?? (body ? "POST" : "GET"), headers, body });
  if (o.raw) {
    if (!res.ok) throw await toError(res);
    return res as unknown as T;
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}

async function toError(res: Response) {
  let j: any = null;
  try { j = await res.json(); } catch { /* not json */ }
  if (res.status === 401) window.dispatchEvent(new CustomEvent("sl:unauthorized"));
  return new ApiError(res.status, j?.error?.code ?? "error", j?.error?.message ?? `Request failed (${res.status})`, j?.error?.details);
}

/** Download a file from an authenticated endpoint. */
export async function download(path: string, fallbackName: string) {
  const res = await api<Response>(path, { raw: true });
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export type { Session };
