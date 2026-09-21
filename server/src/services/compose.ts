import sanitizeHtml from "sanitize-html";
import { env } from "../env";
import { trackSig } from "../lib/crypto";

const ALLOWED_TAGS = [
  "a", "b", "i", "u", "s", "em", "strong", "p", "br", "hr", "div", "span", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote", "pre", "code", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "img",
  "center", "font", "small", "sup", "sub",
];

/** Removes scripts, event handlers, iframes, forms and non-http(s) URLs from user-supplied email HTML. */
export function cleanHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": ["style", "align", "valign", "width", "height", "bgcolor", "color", "class", "dir", "lang", "title"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "style", "border"],
      td: ["colspan", "rowspan", "style", "width", "align", "valign", "bgcolor"],
      th: ["colspan", "rowspan", "style", "width", "align", "valign", "bgcolor"],
      table: ["cellpadding", "cellspacing", "border", "width", "style", "align", "bgcolor", "role"],
      font: ["face", "size", "color"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: false,
    transformTags: { a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: "noopener noreferrer" } }) },
  });
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** {{ variable }} merge fields. Values are HTML-escaped when merged into HTML. Unknown variables are left blank. */
export function mergeVars(template: string, vars: Record<string, unknown>, html: boolean): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => {
    const v = key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), vars);
    const s = v == null ? "" : String(v);
    return html ? escapeHtml(s) : s;
  });
}

export const findVariables = (...parts: string[]) =>
  [...new Set(parts.flatMap((p) => [...p.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]!)))];

export function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Ordered list of trackable http(s) links in the HTML. */
export function extractLinks(html: string): { i: number; url: string }[] {
  const out: { i: number; url: string }[] = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*"(https?:\/\/[^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ i: out.length, url: m[1]!.replace(/&amp;/g, "&") });
  return out;
}

export const pixelUrl = (t: string) => `${env.PUBLIC_URL}/t/o/${t}.gif?s=${trackSig(`o:${t}`)}`;
export const clickUrl = (t: string, i: number) => `${env.PUBLIC_URL}/t/c/${t}/${i}?s=${trackSig(`c:${t}:${i}`)}`;
export const fileUrl = (t: string) => `${env.PUBLIC_URL}/f/${t}`;
export const unsubscribeUrl = (t: string) => `${env.PUBLIC_URL}/u/${t}?s=${trackSig(`u:${t}`)}`;

export type PersonalizeInput = {
  html: string;
  text: string;
  token: string;
  tracking: { open: boolean; click: boolean; files: boolean };
  files: { name: string; size: number; token: string }[];
  notice?: string | null;
  unsubscribe: boolean;
};

const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

/** Produces the exact HTML/text delivered to one recipient (or one group send). */
export function personalize(p: PersonalizeInput): { html: string; text: string } {
  let html = p.html;
  let text = p.text;

  if (p.tracking.click) {
    let i = 0;
    html = html.replace(/(<a\b[^>]*?\bhref\s*=\s*")(https?:\/\/[^"]+)(")/gi, (_m, a: string, _url: string, z: string) => `${a}${clickUrl(p.token, i++)}${z}`);
  }

  const extras: string[] = [];
  const textExtras: string[] = [];
  if (p.files.length) {
    const rows = p.files.map((f) =>
      `<tr><td style="padding:8px 12px;border-top:1px solid #e5e7eb;font:14px/1.4 Arial,sans-serif;color:#111827">${escapeHtml(f.name)} <span style="color:#6b7280">(${fmtSize(f.size)})</span></td>` +
      `<td style="padding:8px 12px;border-top:1px solid #e5e7eb;text-align:right"><a href="${fileUrl(f.token)}" style="font:600 14px Arial,sans-serif;color:#0f5c4d">View file</a></td></tr>`).join("");
    extras.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:8px;width:100%;max-width:560px"><tr><td colspan="2" style="padding:10px 12px;font:600 13px Arial,sans-serif;color:#374151;background:#f9fafb">Secure files</td></tr>${rows}</table>`);
    textExtras.push("Secure files:", ...p.files.map((f) => `- ${f.name} (${fmtSize(f.size)}): ${fileUrl(f.token)}`));
  }
  if (p.notice) {
    extras.push(`<p style="margin:24px 0 0;font:12px/1.5 Arial,sans-serif;color:#6b7280">${escapeHtml(p.notice)}</p>`);
    textExtras.push("", p.notice);
  }
  if (p.unsubscribe) {
    extras.push(`<p style="margin:8px 0 0;font:12px Arial,sans-serif;color:#6b7280"><a href="${unsubscribeUrl(p.token)}" style="color:#6b7280">Unsubscribe</a></p>`);
    textExtras.push(`Unsubscribe: ${unsubscribeUrl(p.token)}`);
  }
  if (p.tracking.open) {
    extras.push(`<img src="${pixelUrl(p.token)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`);
  }

  const extraHtml = extras.join("");
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${extraHtml}</body>`) : html + extraHtml;
  if (textExtras.length) text = `${text}\n\n${textExtras.join("\n")}`;
  return { html, text };
}
