export const fmtDate = (s?: string | null, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) =>
  s ? new Intl.DateTimeFormat(undefined, opts).format(new Date(s)) : "—";

export function ago(s?: string | null) {
  if (!s) return "—";
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 45) return "just now";
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  if (d < 86400 * 7) return `${Math.round(d / 86400)}d ago`;
  return fmtDate(s, { dateStyle: "medium" });
}

export const bytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
export const num = (n?: number | null) => (n ?? 0).toLocaleString();
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export const EVENT_LABEL: Record<string, string> = {
  "message.created": "Message created", "message.scheduled": "Scheduled", "message.queued": "Content frozen & queued",
  "message.sent": "Accepted by provider", "message.delivered": "Delivered to mail server", "message.delivery_delayed": "Delivery delayed",
  "message.opened": "Opened", "message.clicked": "Link clicked", "message.file_viewed": "Secure file viewed", "message.file_downloaded": "File downloaded",
  "message.bounced": "Bounced", "message.complained": "Marked as spam", "message.failed": "Failed", "message.suppressed": "Skipped — suppressed",
  "message.unsubscribed": "Unsubscribed", "message.revoked": "Access revoked", "message.exported": "Evidence exported",
  "message.archived": "Archived", "message.deleted": "Deleted",
};

export const EVENT_HELP: Record<string, string> = {
  "message.sent": "The sending provider accepted the message. This is not confirmation that it reached the inbox.",
  "message.delivered": "The recipient's mail server accepted the message. It doesn't confirm anyone saw it.",
  "message.opened": "A tracking image loaded. Images can be blocked (hiding real opens) or loaded by privacy proxies and scanners.",
  "message.clicked": "A tracked link was requested. Security scanners can click links automatically.",
  "message.file_viewed": "The secure file page was loaded using this recipient's link.",
  "message.file_downloaded": "The file itself was requested using this recipient's link.",
};

export const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "muted" | "accent"> = {
  draft: "muted", scheduled: "warn", queued: "warn", sending: "warn", sent: "accent", partially_failed: "warn", failed: "bad",
  pending: "muted", suppressed: "muted", accepted: "accent", delivered: "ok", bounced: "bad", complained: "bad",
};

export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
