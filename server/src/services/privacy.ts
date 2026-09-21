import { env } from "../env";
import { hmac } from "../lib/crypto";

/**
 * IP handling policy: SentLedger never stores full IP addresses for tracking events.
 * We keep (a) a truncated network prefix (/24 IPv4, /48 IPv6) and (b) a keyed hash used only
 * to de-duplicate repeated requests. Neither identifies a person or a precise location.
 */
export function truncateIp(ip?: string | null): string | null {
  if (!ip) return null;
  if (ip.includes(".")) {
    const p = ip.replace(/^::ffff:/, "").split(".");
    return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.0/24` : null;
  }
  const parts = ip.split(":");
  return `${parts.slice(0, 3).join(":")}::/48`;
}

export const hashIp = (ip?: string | null) => (ip ? hmac(env.IP_HASH_SALT, ip).slice(0, 32) : null);

export type Device = "desktop" | "mobile" | "tablet" | "proxy" | "bot" | "unknown";

export function classify(ua: string | undefined | null, ip: string | undefined | null) {
  const u = (ua ?? "").toLowerCase();
  let device: Device = "unknown";
  let proxy: string | null = null;
  let bot = false;

  if (u.includes("googleimageproxy") || u.includes("ggpht.com")) proxy = "gmail_image_proxy";
  else if (u.includes("yahoomailproxy")) proxy = "yahoo_mail_proxy";
  else if (u.includes("ms-office") && u.includes("outlook")) device = "desktop";

  // Apple Mail Privacy Protection preloads content from Apple-owned address space (17.0.0.0/8)
  // with a generic user agent. These loads can happen without the recipient reading the message.
  if (!proxy && ip && /^(::ffff:)?17\./.test(ip)) proxy = "apple_privacy_proxy";

  if (/(bot|crawler|spider|preview|scanner|safelinks|mimecast|barracuda|proofpoint|urldefense|forcepoint|symantec|trendmicro|headless|python-requests|curl|wget|go-http-client)/.test(u)) bot = true;

  if (proxy) device = "proxy";
  else if (bot) device = "bot";
  else if (/ipad|tablet/.test(u)) device = "tablet";
  else if (/iphone|android|mobile/.test(u)) device = "mobile";
  else if (/windows|macintosh|x11|linux|cros/.test(u)) device = "desktop";

  return { device, proxy, bot };
}

/**
 * Decide whether an open/click is "uncertain": proxied loads, automated scanners, or events so soon after
 * sending that they are most likely security prefetching rather than a person.
 */
export function assess(kind: "open" | "click" | "file", ua: string | undefined, ip: string | undefined, sentAt?: string | null) {
  const c = classify(ua, ip);
  const secondsSinceSend = sentAt ? (Date.now() - new Date(sentAt).getTime()) / 1000 : Infinity;
  const tooFast = kind === "click" ? secondsSinceSend < 10 : kind === "open" ? secondsSinceSend < 3 : false;
  const reasons: string[] = [];
  if (c.proxy) reasons.push(c.proxy);
  if (c.bot) reasons.push("automated_client");
  if (tooFast) reasons.push("immediately_after_send");
  return { ...c, isProxy: Boolean(c.proxy), uncertain: reasons.length > 0, reasons };
}
