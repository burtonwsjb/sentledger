import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { cleanHtml, extractLinks, findVariables, htmlToText, mergeVars, personalize } from "../src/services/compose";
import { assess, classify, hashIp, truncateIp } from "../src/services/privacy";
import { decrypt, encrypt, trackSig } from "../src/lib/crypto";
import { isSafeWebhookUrl, sign } from "../src/services/webhooks";
import { verifySvix } from "../src/routes/provider-webhooks";
import { parseCsv } from "../src/routes/v1/content";
import { buildMime } from "../src/providers/mime";
import { ledgerCsv } from "../src/services/evidence";
import { decodeCursor, encodeCursor } from "../src/lib/http";

describe("html sanitization", () => {
  test("strips scripts, handlers and javascript: urls", () => {
    const out = cleanHtml(`<p onclick="x()">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><iframe src="https://e.com"></iframe><img src="https://e.com/a.png" onerror="y()">`);
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("iframe");
    expect(out).toContain("<p>Hi</p>");
  });
  test("keeps safe links and adds rel", () => {
    expect(cleanHtml(`<a href="https://ok.com/x">ok</a>`)).toContain('rel="noopener noreferrer"');
  });
});

describe("merge fields", () => {
  test("escapes values in html, not in text", () => {
    expect(mergeVars("Hi {{ name }}", { name: "<b>A&B</b>" }, true)).toBe("Hi &lt;b&gt;A&amp;B&lt;/b&gt;");
    expect(mergeVars("Hi {{name}}", { name: "<b>" }, false)).toBe("Hi <b>");
    expect(mergeVars("{{a.b}} {{missing}}", { a: { b: 1 } }, false)).toBe("1 ");
    expect(findVariables("{{x}} {{ y }}", "{{x}}")).toEqual(["x", "y"]);
  });
});

describe("personalization", () => {
  const html = `<p>See <a href="https://a.com/1">one</a> and <a href="https://b.com/2?x=1&amp;y=2">two</a> <a href="mailto:z@z.com">mail</a></p>`;
  test("extracts http(s) links in order", () => {
    expect(extractLinks(html)).toEqual([{ i: 0, url: "https://a.com/1" }, { i: 1, url: "https://b.com/2?x=1&y=2" }]);
  });
  test("rewrites links, adds pixel, files, notice and unsubscribe", () => {
    const out = personalize({ html, text: "hello", token: "tok_abcdefghijklmnop", tracking: { open: true, click: true, files: true }, files: [{ name: "a.pdf", size: 2_000_000, token: "ftok_abcdefghijklmn" }], notice: "Tracking notice", unsubscribe: true });
    expect(out.html).toContain(`/t/c/tok_abcdefghijklmnop/0?s=${trackSig("c:tok_abcdefghijklmnop:0")}`);
    expect(out.html).toContain("/t/c/tok_abcdefghijklmnop/1?s=");
    expect(out.html).toContain("mailto:z@z.com");
    expect(out.html).not.toContain("https://a.com/1");
    expect(out.html).toContain(`/t/o/tok_abcdefghijklmnop.gif?s=${trackSig("o:tok_abcdefghijklmnop")}`);
    expect(out.html).toContain("/f/ftok_abcdefghijklmn");
    expect(out.html).toContain("Tracking notice");
    expect(out.text).toContain("Unsubscribe:");
  });
  test("tracking off leaves links and adds no pixel", () => {
    const out = personalize({ html, text: "", token: "tok_abcdefghijklmnop", tracking: { open: false, click: false, files: false }, files: [], notice: null, unsubscribe: false });
    expect(out.html).toContain("https://a.com/1");
    expect(out.html).not.toContain("/t/o/");
  });
  test("html to text", () => {
    expect(htmlToText(`<p>Hi</p><p><a href="https://x.com">link</a></p>`)).toBe("Hi\nlink (https://x.com)");
  });
});

describe("privacy", () => {
  test("truncates IPs", () => {
    expect(truncateIp("203.0.113.77")).toBe("203.0.113.0/24");
    expect(truncateIp("::ffff:198.51.100.9")).toBe("198.51.100.0/24");
    expect(truncateIp("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::/48");
    expect(hashIp("1.2.3.4")).toHaveLength(32);
  });
  test("detects proxies and bots", () => {
    expect(classify("Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)", "66.249.1.1").proxy).toBe("gmail_image_proxy");
    expect(classify("Mozilla/5.0", "17.58.1.2").proxy).toBe("apple_privacy_proxy");
    expect(classify("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", "203.0.113.5").device).toBe("mobile");
    expect(classify("python-requests/2.31", "203.0.113.5").device).toBe("bot");
    const a = assess("click", "Mozilla/5.0 (Windows NT 10.0)", "203.0.113.5", new Date().toISOString());
    expect(a.uncertain).toBe(true);
    expect(a.reasons).toContain("immediately_after_send");
    expect(assess("open", "Mozilla/5.0 (Macintosh)", "203.0.113.5", new Date(Date.now() - 3600_000).toISOString()).uncertain).toBe(false);
  });
});

describe("crypto & signatures", () => {
  test("AES-GCM roundtrip and tamper detection", () => {
    const c = encrypt("refresh-token-123");
    expect(c.startsWith("v1.")).toBe(true);
    expect(decrypt(c)).toBe("refresh-token-123");
    const parts = c.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  test("customer webhook signature format", () => {
    const s = sign("whsec_test", '{"a":1}', 1700000000);
    const expected = createHmac("sha256", "whsec_test").update('1700000000.{"a":1}').digest("hex");
    expect(s).toBe(`t=1700000000,v1=${expected}`);
  });
  test("svix verification", () => {
    const secret = `whsec_${Buffer.from("supersecretkey123").toString("base64")}`;
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", Buffer.from("supersecretkey123")).update(`msg_1.${ts}.{}`).digest("base64");
    expect(verifySvix(secret, "msg_1", ts, "{}", `v1,${sig}`)).toBe(true);
    expect(verifySvix(secret, "msg_1", ts, "{ }", `v1,${sig}`)).toBe(false);
    expect(verifySvix(secret, "msg_1", String(Number(ts) - 1000), "{}", `v1,${sig}`)).toBe(false);
  });
  test("webhook URL safety", () => {
    expect(isSafeWebhookUrl("https://hooks.example.com/x")).toBe(true);
    expect(isSafeWebhookUrl("http://hooks.example.com/x")).toBe(false);
    expect(isSafeWebhookUrl("https://127.0.0.1/x")).toBe(false);
    expect(isSafeWebhookUrl("https://10.0.0.5/x")).toBe(false);
    expect(isSafeWebhookUrl("https://svc.railway.internal/x")).toBe(false);
    expect(isSafeWebhookUrl("https://localhost/x")).toBe(false);
  });
});

describe("csv", () => {
  test("parses quotes, commas and newlines", () => {
    const rows = parseCsv('email,name,notes\r\na@x.com,"Smith, Jo","line1\nline2"\nb@x.com,"He said ""hi""",\n');
    expect(rows).toEqual([["email", "name", "notes"], ["a@x.com", "Smith, Jo", "line1\nline2"], ["b@x.com", 'He said "hi"', ""]]);
  });
  test("export guards against formula injection", () => {
    const csv = ledgerCsv({ events: [{ seq: 1, occurred_at: "t", type: "message.opened", recipient: "=HYPERLINK(1)", source: "tracking", device: null, network: null, is_proxy: false, uncertain: false, is_duplicate: false, hash_verified: true, hash: "h", prev_hash: "p", data: {} }] } as any);
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
  });
});

describe("mime & cursors", () => {
  test("builds multipart mime with encoded subject", () => {
    const m = buildMime({ from: { email: "a@x.com", name: "A" }, to: [{ email: "b@y.com" }], subject: "Héllo", html: "<p>x</p>", text: "x", headers: { "X-Test": "1" } });
    expect(m).toContain("Subject: =?UTF-8?B?");
    expect(m).toContain("multipart/alternative");
    expect(m).toContain("X-Test: 1");
  });
  test("cursor roundtrip", () => {
    const c = encodeCursor({ created_at: "2026-09-21T10:00:00.000Z", id: "abc" });
    expect(decodeCursor(c)).toEqual({ createdAt: "2026-09-21T10:00:00.000Z", id: "abc" });
  });
});
