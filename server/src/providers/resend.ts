import { env } from "../env";
import { type EmailProvider, type OutboundEmail, ProviderError, fmtAddr } from "./types";

const API = "https://api.resend.com";

async function call(path: string, init: RequestInit = {}) {
  if (!env.RESEND_API_KEY) throw new ProviderError("Email sending is not configured (RESEND_API_KEY missing)", false);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    throw new ProviderError(`Resend ${res.status}: ${json?.message ?? text.slice(0, 200)}`, retryable, res.status);
  }
  return json;
}

export const resend: EmailProvider = {
  name: "resend",
  capabilities: { deliveryEvents: true, bounceEvents: true, messageId: true },
  async send(m: OutboundEmail) {
    const body = {
      from: fmtAddr(m.from),
      to: m.to.map(fmtAddr),
      cc: m.cc?.length ? m.cc.map(fmtAddr) : undefined,
      bcc: m.bcc?.length ? m.bcc.map(fmtAddr) : undefined,
      reply_to: m.replyTo || undefined,
      subject: m.subject,
      html: m.html,
      text: m.text,
      headers: m.headers,
      tags: m.tags ? Object.entries(m.tags).map(([name, value]) => ({ name, value: value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256) })) : undefined,
    };
    const r = await call("/emails", { method: "POST", body: JSON.stringify(body) });
    return { providerMessageId: r?.id ?? null };
  },
};

// ---- Domain onboarding (SPF / DKIM / return-path records come from Resend) ----
export type DnsRecord = { record: string; name: string; type: string; value: string; ttl?: string; priority?: number; status?: string };

export async function createDomain(domain: string): Promise<{ id: string; records: DnsRecord[]; status: string }> {
  const r = await call("/domains", { method: "POST", body: JSON.stringify({ name: domain }) });
  return { id: r.id, records: r.records ?? [], status: r.status };
}
export async function getDomain(id: string): Promise<{ status: string; records: DnsRecord[] }> {
  const r = await call(`/domains/${id}`);
  return { status: r.status, records: r.records ?? [] };
}
export async function verifyDomain(id: string) {
  await call(`/domains/${id}/verify`, { method: "POST" });
}
export async function deleteDomain(id: string) {
  await call(`/domains/${id}`, { method: "DELETE" });
}
