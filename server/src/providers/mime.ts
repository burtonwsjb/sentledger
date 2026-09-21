import { type OutboundEmail, fmtAddr } from "./types";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
const encWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);

/** Build an RFC 5322 multipart/alternative message (used for Gmail API raw sends). */
export function buildMime(m: OutboundEmail): string {
  const boundary = `sl_${crypto.randomUUID().replaceAll("-", "")}`;
  const lines: string[] = [
    `From: ${fmtAddr(m.from)}`,
    `To: ${m.to.map(fmtAddr).join(", ")}`,
  ];
  if (m.cc?.length) lines.push(`Cc: ${m.cc.map(fmtAddr).join(", ")}`);
  if (m.bcc?.length) lines.push(`Bcc: ${m.bcc.map(fmtAddr).join(", ")}`);
  if (m.replyTo) lines.push(`Reply-To: ${m.replyTo}`);
  lines.push(`Subject: ${encWord(m.subject)}`, "MIME-Version: 1.0");
  for (const [k, v] of Object.entries(m.headers ?? {})) lines.push(`${k}: ${v.replace(/[\r\n]/g, " ")}`);
  lines.push(
    `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(m.text),
    `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(m.html),
    `--${boundary}--`, "",
  );
  return lines.join("\r\n");
}
