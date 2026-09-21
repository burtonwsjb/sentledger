// Gmail + Microsoft 365 OAuth: connection flow, encrypted token storage, refresh lifecycle, sending.
import { env } from "../env";
import { db, must } from "../lib/db";
import { decrypt, encrypt, hmac, token } from "../lib/crypto";
import { fail } from "../lib/errors";
import { log } from "../lib/log";
import { buildMime } from "./mime";
import { type EmailProvider, type OutboundEmail, ProviderError } from "./types";

export type OAuthProvider = "gmail" | "microsoft";

// Least privilege: send-only mail scope + identity to learn the account address.
export const SCOPES: Record<OAuthProvider, string[]> = {
  gmail: ["openid", "email", "https://www.googleapis.com/auth/gmail.send"],
  microsoft: ["openid", "email", "offline_access", "User.Read", "Mail.Send"],
};

const cfg = {
  gmail: {
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    id: () => env.GOOGLE_CLIENT_ID,
    secret: () => env.GOOGLE_CLIENT_SECRET,
  },
  microsoft: {
    auth: `https://login.microsoftonline.com/${env.MICROSOFT_TENANT}/oauth2/v2.0/authorize`,
    token: `https://login.microsoftonline.com/${env.MICROSOFT_TENANT}/oauth2/v2.0/token`,
    id: () => env.MICROSOFT_CLIENT_ID,
    secret: () => env.MICROSOFT_CLIENT_SECRET,
  },
};

const redirectUri = (p: OAuthProvider) => `${env.PUBLIC_URL}/oauth/${p}/callback`;

/** State is signed so the callback can trust org/user without server-side session storage. */
export function authorizeUrl(p: OAuthProvider, orgId: string, userId: string) {
  const c = cfg[p];
  if (!c.id() || !c.secret()) fail("not_configured", `${p === "gmail" ? "Gmail" : "Microsoft 365"} connection is not configured yet`);
  const payload = Buffer.from(JSON.stringify({ o: orgId, u: userId, n: token(8), t: Date.now() })).toString("base64url");
  const state = `${payload}.${hmac(env.TRACKING_SECRET, payload).slice(0, 32)}`;
  const q = new URLSearchParams({
    client_id: c.id()!, redirect_uri: redirectUri(p), response_type: "code", scope: SCOPES[p].join(" "), state,
    ...(p === "gmail" ? { access_type: "offline", prompt: "consent", include_granted_scopes: "true" } : { prompt: "select_account" }),
  });
  return `${c.auth}?${q}`;
}

export function readState(state: string): { o: string; u: string } {
  const [payload, sig] = state.split(".");
  if (!payload || !sig || hmac(env.TRACKING_SECRET, payload).slice(0, 32) !== sig) fail("bad_request", "Invalid OAuth state");
  const s = JSON.parse(Buffer.from(payload!, "base64url").toString());
  if (Date.now() - s.t > 15 * 60_000) fail("bad_request", "OAuth request expired. Please try connecting again.");
  return s;
}

async function tokenRequest(p: OAuthProvider, params: Record<string, string>) {
  const c = cfg[p];
  const res = await fetch(c.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.id()!, client_secret: c.secret()!, ...params }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProviderError(`${p} token error: ${json.error_description ?? json.error ?? res.status}`, res.status >= 500, res.status);
  return json as { access_token: string; refresh_token?: string; expires_in: number; id_token?: string; scope?: string };
}

const emailFromIdToken = (idToken?: string) => {
  if (!idToken) return null;
  try {
    const claims = JSON.parse(Buffer.from(idToken.split(".")[1]!, "base64url").toString());
    return (claims.email ?? claims.preferred_username ?? null) as string | null;
  } catch {
    return null;
  }
};

export async function completeConnection(p: OAuthProvider, code: string, state: string) {
  const s = readState(state);
  const t = await tokenRequest(p, { grant_type: "authorization_code", code, redirect_uri: redirectUri(p) });
  let email = emailFromIdToken(t.id_token);
  if (!email && p === "microsoft") {
    const me: any = await (await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${t.access_token}` } })).json();
    email = me.mail ?? me.userPrincipalName;
  }
  if (!email) fail("provider_error", "Could not read the connected account's email address");
  if (!t.refresh_token) fail("provider_error", "The provider did not grant offline access. Please reconnect and approve all requested permissions.");
  const row = {
    org_id: s.o, user_id: s.u, provider: p, account_email: email!.toLowerCase(),
    scopes: (t.scope ?? SCOPES[p].join(" ")).split(" "),
    access_token_enc: encrypt(t.access_token), refresh_token_enc: encrypt(t.refresh_token!),
    token_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    status: "connected", last_error: null, last_sync_at: new Date().toISOString(),
  };
  const conn = must(await db.from("provider_connections").upsert(row, { onConflict: "org_id,provider,account_email" }).select("id, org_id, account_email").single(), "connection") as any;
  const existing = must(await db.from("sender_identities").select("id").eq("connection_id", conn.id).maybeSingle(), "identity");
  if (!existing) await db.from("sender_identities").insert({ org_id: s.o, kind: p, email: conn.account_email, connection_id: conn.id });
  return { orgId: s.o, userId: s.u, connectionId: conn.id as string, email: conn.account_email as string };
}

/** Returns a valid access token, refreshing (and persisting) when needed. Marks connection for re-auth on hard failure. */
export async function accessToken(connectionId: string): Promise<{ token: string; provider: OAuthProvider }> {
  const conn = must(await db.from("provider_connections").select("*").eq("id", connectionId).single(), "connection") as any;
  if (conn.status !== "connected") throw new ProviderError(`${conn.account_email} needs to be reconnected`, false);
  if (conn.token_expires_at && new Date(conn.token_expires_at) > new Date()) {
    return { token: decrypt(conn.access_token_enc), provider: conn.provider };
  }
  try {
    const t = await tokenRequest(conn.provider, { grant_type: "refresh_token", refresh_token: decrypt(conn.refresh_token_enc) });
    await db.from("provider_connections").update({
      access_token_enc: encrypt(t.access_token),
      refresh_token_enc: t.refresh_token ? encrypt(t.refresh_token) : conn.refresh_token_enc,
      token_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
      last_error: null,
    }).eq("id", connectionId);
    return { token: t.access_token, provider: conn.provider };
  } catch (e) {
    const err = e as ProviderError;
    if (!err.retryable) {
      await db.from("provider_connections").update({ status: "needs_reauth", last_error: err.message }).eq("id", connectionId);
      log.warn("oauth connection needs reauth", { connectionId, provider: conn.provider });
    }
    throw err;
  }
}

export function connectedProvider(connectionId: string, kind: OAuthProvider): EmailProvider {
  if (kind === "gmail") {
    return {
      name: "gmail",
      capabilities: { deliveryEvents: false, bounceEvents: false, messageId: true },
      async send(m: OutboundEmail) {
        const { token: at } = await accessToken(connectionId);
        const raw = Buffer.from(buildMime(m)).toString("base64url");
        const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST", headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw }),
        });
        const j: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new ProviderError(`Gmail ${res.status}: ${j.error?.message ?? "send failed"}`, res.status === 429 || res.status >= 500, res.status);
        await db.from("provider_connections").update({ last_used_at: new Date().toISOString() }).eq("id", connectionId);
        return { providerMessageId: j.id ?? null };
      },
    };
  }
  return {
    name: "microsoft",
    capabilities: { deliveryEvents: false, bounceEvents: false, messageId: false },
    async send(m: OutboundEmail) {
      const { token: at } = await accessToken(connectionId);
      const rcpt = (list?: { email: string; name?: string | null }[]) => (list ?? []).map((a) => ({ emailAddress: { address: a.email, name: a.name ?? undefined } }));
      const headers = Object.entries(m.headers ?? {}).filter(([k]) => k.toLowerCase().startsWith("x-")).map(([name, value]) => ({ name, value }));
      const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: m.subject, body: { contentType: "HTML", content: m.html },
            toRecipients: rcpt(m.to), ccRecipients: rcpt(m.cc), bccRecipients: rcpt(m.bcc),
            replyTo: m.replyTo ? [{ emailAddress: { address: m.replyTo } }] : undefined,
            internetMessageHeaders: headers.length ? headers : undefined,
          },
          saveToSentItems: true,
        }),
      });
      if (!res.ok) {
        const j: any = await res.json().catch(() => ({}));
        throw new ProviderError(`Microsoft ${res.status}: ${j.error?.message ?? "send failed"}`, res.status === 429 || res.status >= 500, res.status);
      }
      await db.from("provider_connections").update({ last_used_at: new Date().toISOString() }).eq("id", connectionId);
      return { providerMessageId: null }; // Graph sendMail returns 202 with no message id
    },
  };
}
