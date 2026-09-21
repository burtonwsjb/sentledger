import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { zipSync, strToU8 } from "fflate";
import { db, must } from "../lib/db";
import { sha256 } from "../lib/crypto";
import { fail } from "../lib/errors";

export const EVENT_MEANINGS: Record<string, string> = {
  "message.created": "The message record was created in SentLedger.",
  "message.scheduled": "The message was scheduled for later delivery.",
  "message.queued": "Content was frozen (hashed) and handed to the delivery queue.",
  "message.sent": "The sending provider accepted the message for delivery. This is not confirmation of mailbox delivery.",
  "message.delivered": "The provider reported that the recipient's mail server accepted the message. It does not confirm the message was seen.",
  "message.delivery_delayed": "The provider reported a temporary delivery delay.",
  "message.opened": "A tracking image in the message was loaded. Image blocking can hide real opens; mail privacy proxies, security scanners and forwarding can create opens the recipient did not perform.",
  "message.clicked": "A tracked link was requested. Security scanners may request links automatically; a forwarded message may be clicked by someone else.",
  "message.file_viewed": "The hosted secure-file page was loaded using a link issued to this recipient.",
  "message.file_downloaded": "The file itself was requested through a link issued to this recipient.",
  "message.bounced": "The provider reported the message could not be delivered.",
  "message.complained": "The recipient's mailbox provider reported a spam complaint.",
  "message.failed": "Delivery failed before or during handoff to the provider.",
  "message.suppressed": "The recipient was skipped because the address is on the suppression list.",
  "message.unsubscribed": "The recipient used the unsubscribe link.",
  "message.revoked": "The sender revoked access to secure files and tracked links in this message.",
  "message.exported": "An evidence export was generated.",
};

export const DISCLAIMER = [
  "SentLedger records technical events reported by email providers and by requests to tracking resources. These records are",
  "evidence of what SentLedger observed; they are not by themselves proof that a specific person received, read, or understood a message.",
  "Opens depend on images loading. Many mail apps block images by default, and privacy features (for example Apple Mail Privacy",
  "Protection or Gmail's image proxy) can load images without the recipient opening the message. Security software can pre-load",
  "links. Forwarded messages can generate events from people other than the original recipient. Network information is truncated",
  "and does not identify a person or a precise location. Events flagged 'uncertain' or 'proxy' should be weighed accordingly.",
  "Integrity: each event stores sha256(prev_hash|id|message_id|recipient_id|type|occurred_at|source|data), forming a hash chain.",
  "Altering or removing any event breaks the chain. This report does not by itself establish admissibility in any proceeding.",
];

export async function buildLedger(orgId: string, messageId: string) {
  const msg = must(await db.from("messages").select("*, message_recipients(*), message_attachments(*), organizations(name)").eq("id", messageId).eq("org_id", orgId).maybeSingle(), "message") as any;
  if (!msg) fail("not_found", "Message not found");
  const events = must(await db.from("events").select("*").eq("message_id", messageId).order("seq"), "events") as any[];
  const chain = must(await db.rpc("verify_message_chain", { p_message: messageId }), "chain") as any[];
  const byId = new Map(chain.map((r) => [r.id, r]));
  const rcpt = new Map(msg.message_recipients.map((r: any) => [r.id, r]));
  const chainValid = chain.every((r) => r.linked && r.recomputed === r.hash);

  return {
    format: "sentledger.evidence.v1",
    generated_at: new Date().toISOString(),
    organization: { id: orgId, name: msg.organizations?.name },
    message: {
      id: msg.id, correlation_id: msg.correlation_id, source: msg.source, status: msg.status, send_via: msg.send_via,
      provider: msg.provider, provider_message_id: msg.provider_message_id, delivery_mode: msg.delivery_mode,
      from: { email: msg.from_email, name: msg.from_name }, reply_to: msg.reply_to, subject: msg.subject,
      created_at: msg.created_at, sent_at: msg.sent_at, content_frozen_at: msg.content_frozen_at,
      revoked_at: msg.revoked_at, expires_at: msg.expires_at, tags: msg.tags, metadata: msg.metadata,
      tracking: msg.tracking, api_key_id: msg.api_key_id,
      content: { html_sha256: msg.html_sha256, text_sha256: msg.text_sha256, html: msg.html, text: msg.text },
    },
    recipients: msg.message_recipients.map((r: any) => ({
      id: r.id, kind: r.kind, email: r.email, name: r.name, status: r.status, provider_message_id: r.provider_message_id,
      delivered_at: r.delivered_at, first_opened_at: r.first_opened_at, open_count: r.open_count, click_count: r.click_count, file_view_count: r.file_view_count,
    })),
    attachments: msg.message_attachments.map((a: any) => ({ file_id: a.file_id, name: a.name, size: a.size, sha256: a.sha256 })),
    events: events.map((e) => {
      const v = byId.get(e.id);
      return {
        seq: e.seq, id: e.id, type: e.type, occurred_at: e.occurred_at, occurred_at_canonical: v?.occurred_at_text, source: e.source,
        recipient: e.recipient_id ? (rcpt.get(e.recipient_id) as any)?.email ?? e.recipient_id : null, recipient_id: e.recipient_id,
        device: e.device, network: e.ip_truncated, user_agent: e.user_agent, is_proxy: e.is_proxy, uncertain: e.uncertain,
        is_duplicate: e.is_duplicate, data: e.data, data_canonical: v?.data_text, prev_hash: e.prev_hash, hash: e.hash,
        hash_verified: Boolean(v && v.linked && v.recomputed === e.hash), meaning: EVENT_MEANINGS[e.type] ?? null,
      };
    }),
    integrity: {
      algorithm: "sha256(prev_hash|id|message_id|recipient_id|type|occurred_at_canonical|source|data_canonical); first prev_hash = 'GENESIS'",
      chain_valid: chainValid,
      event_count: events.length,
      head_hash: events.at(-1)?.hash ?? null,
    },
    disclaimer: DISCLAIMER.join(" "),
  };
}

export type Ledger = Awaited<ReturnType<typeof buildLedger>>;

const csvCell = (v: unknown) => {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s;
};

export function ledgerCsv(l: Ledger): string {
  const cols = ["seq", "occurred_at", "type", "recipient", "source", "device", "network", "is_proxy", "uncertain", "is_duplicate", "hash_verified", "hash", "prev_hash", "details"];
  const rows = l.events.map((e) => [e.seq, e.occurred_at, e.type, e.recipient, e.source, e.device, e.network, e.is_proxy, e.uncertain, e.is_duplicate, e.hash_verified, e.hash, e.prev_hash, e.data]);
  return [cols.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
}

// ---------- PDF ----------
class Writer {
  page!: PDFPage;
  y = 0;
  constructor(public doc: PDFDocument, public font: PDFFont, public bold: PDFFont, public mono: PDFFont) { this.newPage(); }
  newPage() {
    this.page = this.doc.addPage([612, 792]);
    this.y = 750;
  }
  ensure(h: number) { if (this.y - h < 50) this.newPage(); }
  text(s: string, opts: { size?: number; font?: PDFFont; color?: [number, number, number]; indent?: number; width?: number } = {}) {
    const size = opts.size ?? 9.5;
    const font = opts.font ?? this.font;
    const x = 50 + (opts.indent ?? 0);
    const max = opts.width ?? 512 - (opts.indent ?? 0);
    const clean = s.replace(/[^\x20-\x7E\n]/g, "?");
    for (const para of clean.split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > max && line) {
          this.ensure(size + 4);
          this.page.drawText(line, { x, y: this.y, size, font, color: rgb(...(opts.color ?? [0.1, 0.1, 0.12])) });
          this.y -= size + 3.5;
          line = word;
          while (font.widthOfTextAtSize(line, size) > max) {
            let cut = line.length;
            while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > max) cut--;
            this.ensure(size + 4);
            this.page.drawText(line.slice(0, cut), { x, y: this.y, size, font, color: rgb(...(opts.color ?? [0.1, 0.1, 0.12])) });
            this.y -= size + 3.5;
            line = line.slice(cut);
          }
        } else line = test;
      }
      this.ensure(size + 4);
      this.page.drawText(line, { x, y: this.y, size, font, color: rgb(...(opts.color ?? [0.1, 0.1, 0.12])) });
      this.y -= size + 3.5;
    }
  }
  heading(s: string) {
    this.y -= 8;
    this.ensure(30);
    this.text(s, { size: 13, font: this.bold, color: [0.06, 0.36, 0.3] });
    this.page.drawLine({ start: { x: 50, y: this.y + 2 }, end: { x: 562, y: this.y + 2 }, thickness: 0.5, color: rgb(0.8, 0.82, 0.8) });
    this.y -= 6;
  }
  kv(k: string, v: unknown) {
    this.text(`${k}: ${v == null || v === "" ? "-" : typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
}

export async function ledgerPdf(l: Ledger): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`SentLedger evidence report ${l.message.id}`);
  doc.setProducer("SentLedger");
  doc.setCreationDate(new Date(l.generated_at));
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), await doc.embedFont(StandardFonts.Courier));

  w.text("SentLedger - Message Evidence Report", { size: 18, font: w.bold });
  w.text(`Generated ${l.generated_at} (UTC) for ${l.organization.name ?? l.organization.id}`, { color: [0.4, 0.42, 0.45] });
  w.y -= 4;
  w.text(l.integrity.chain_valid ? "Ledger integrity: VERIFIED - all event hashes recomputed and chained correctly." : "Ledger integrity: FAILED - one or more events do not match their recorded hash.", {
    font: w.bold, color: l.integrity.chain_valid ? [0.06, 0.45, 0.3] : [0.7, 0.1, 0.1],
  });

  w.heading("Message");
  w.kv("SentLedger message ID", l.message.id);
  w.kv("Correlation ID", l.message.correlation_id);
  w.kv("Subject", l.message.subject);
  w.kv("From", `${l.message.from.name ? `${l.message.from.name} ` : ""}<${l.message.from.email}>`);
  w.kv("Reply-To", l.message.reply_to);
  w.kv("Sent via", `${l.message.send_via} (${l.message.provider ?? "not sent"})`);
  w.kv("Provider message ID", l.message.provider_message_id);
  w.kv("Delivery mode", l.message.delivery_mode === "group" ? "Group email (engagement cannot be attributed to a specific recipient)" : "Individual tracked copies");
  w.kv("Created", l.message.created_at);
  w.kv("Content frozen", l.message.content_frozen_at);
  w.kv("Sent", l.message.sent_at);
  w.kv("Revoked", l.message.revoked_at);
  w.kv("Tracking enabled", `opens ${l.message.tracking?.open ? "on" : "off"}, links ${l.message.tracking?.click ? "on" : "off"}, files ${l.message.tracking?.files ? "on" : "off"}`);
  if (Object.keys(l.message.metadata ?? {}).length) w.kv("Metadata", l.message.metadata);
  w.text("Content hashes (SHA-256 of the canonical body before per-recipient tracking links were inserted):", { font: w.bold });
  w.text(`HTML  ${l.message.content.html_sha256 ?? "-"}`, { font: w.mono, size: 8 });
  w.text(`Text  ${l.message.content.text_sha256 ?? "-"}`, { font: w.mono, size: 8 });

  w.heading("Recipients");
  for (const r of l.recipients) {
    w.text(`${r.kind.toUpperCase()}  ${r.name ? `${r.name} ` : ""}<${r.email}>  - status: ${r.status}${r.delivered_at ? `, delivered ${r.delivered_at}` : ""}${r.first_opened_at ? `, first open ${r.first_opened_at}` : ""}  (opens ${r.open_count}, clicks ${r.click_count}, file views ${r.file_view_count})`);
  }

  if (l.attachments.length) {
    w.heading("Secure files");
    for (const a of l.attachments) w.text(`${a.name} (${a.size} bytes)  sha256 ${a.sha256}`, { size: 8.5 });
  }

  w.heading("Event timeline");
  for (const e of l.events) {
    const flags = [e.is_proxy && "PROXY", e.uncertain && "UNCERTAIN", e.is_duplicate && "DUPLICATE", !e.hash_verified && "HASH MISMATCH"].filter(Boolean).join(", ");
    w.ensure(40);
    w.text(`#${e.seq}  ${e.occurred_at}  ${e.type}${e.recipient ? `  -> ${e.recipient}` : ""}${flags ? `  [${flags}]` : ""}`, { font: w.bold, size: 9 });
    const details = [
      `source ${e.source}`, e.device && `device ${e.device}`, e.network && `network ${e.network}`,
      (e.data as any)?.url && `link ${(e.data as any).url}`, (e.data as any)?.file_name && `file ${(e.data as any).file_name}`,
      (e.data as any)?.provider_message_id && `provider id ${(e.data as any).provider_message_id}`,
      (e.data as any)?.reasons?.length && `flags: ${(e.data as any).reasons.join(", ")}`,
    ].filter(Boolean).join(" | ");
    if (details) w.text(details, { indent: 14, size: 8.5, color: [0.3, 0.32, 0.35] });
    w.text(`hash ${e.hash}`, { indent: 14, size: 7, font: w.mono, color: [0.45, 0.45, 0.48] });
  }

  w.heading("What each event means");
  for (const t of [...new Set(l.events.map((e) => e.type))]) w.text(`${t}: ${EVENT_MEANINGS[t] ?? ""}`, { size: 8.5 });

  w.heading("Technical limitations and integrity method");
  w.text(DISCLAIMER.join(" "), { size: 8.5 });
  w.text(`Chain head hash: ${l.integrity.head_hash ?? "-"}  (${l.integrity.event_count} events)`, { size: 8, font: w.mono });

  w.heading("Appendix: message text as sent (canonical)");
  w.text(l.message.content.text || "(no plain-text body)", { size: 8.5, font: w.mono });

  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`SentLedger evidence report - ${l.message.id} - page ${i + 1} of ${pages.length}`, { x: 50, y: 28, size: 7.5, font: w.font, color: rgb(0.5, 0.5, 0.52) }));
  return doc.save();
}

/** Zip with ledger.json, events.csv, report.pdf and a manifest of SHA-256 hashes for each file. */
export async function evidencePackage(l: Ledger) {
  const json = strToU8(JSON.stringify(l, null, 2));
  const csv = strToU8(ledgerCsv(l));
  const pdf = await ledgerPdf(l);
  const files = { "ledger.json": json, "events.csv": csv, "report.pdf": pdf };
  const manifest = {
    format: "sentledger.manifest.v1", message_id: l.message.id, generated_at: l.generated_at,
    chain_head_hash: l.integrity.head_hash, chain_valid: l.integrity.chain_valid,
    files: Object.entries(files).map(([name, data]) => ({ name, bytes: data.length, sha256: sha256(data) })),
  };
  const manifestText = JSON.stringify(manifest, null, 2);
  const zip = zipSync({ ...files, "manifest.json": strToU8(manifestText), "manifest.sha256": strToU8(`${sha256(manifestText)}  manifest.json\n`) }, { level: 6 });
  return { zip, manifest };
}
