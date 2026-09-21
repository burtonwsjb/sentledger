import { env } from "../env";
import { log } from "../lib/log";
import { managedProvider } from "../providers";

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** Transactional platform email (invitations, alerts). Untracked. */
export async function sendPlatformEmail(p: { to: string; subject: string; heading: string; body: string; cta?: { label: string; url: string } }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f5;padding:24px;font-family:Arial,sans-serif">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px"><tr><td style="padding:28px">
<div style="font-weight:700;color:#0f5c4d;font-size:16px;margin-bottom:20px">SentLedger</div>
<h1 style="font-size:20px;color:#111827;margin:0 0 12px">${esc(p.heading)}</h1>
<p style="font-size:15px;line-height:1.55;color:#374151;margin:0 0 20px">${esc(p.body)}</p>
${p.cta ? `<a href="${esc(p.cta.url)}" style="display:inline-block;background:#0f5c4d;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:15px">${esc(p.cta.label)}</a>
<p style="font-size:12px;color:#6b7280;margin:20px 0 0">Or paste this link into your browser:<br>${esc(p.cta.url)}</p>` : ""}
</td></tr></table></body></html>`;
  const text = `${p.heading}\n\n${p.body}${p.cta ? `\n\n${p.cta.label}: ${p.cta.url}` : ""}\n\n— SentLedger`;
  try {
    await managedProvider().send({ from: { email: env.PLATFORM_FROM_EMAIL, name: "SentLedger" }, to: [{ email: p.to }], subject: p.subject, html, text });
  } catch (e) {
    log.error("platform email failed", { err: e, to: p.to, subject: p.subject });
  }
}
