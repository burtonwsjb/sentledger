/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import { env } from "../env";
import { Icons, Layout } from "./layout";

// ---------- shared product previews (real UI patterns, realistic sample data) ----------
export const LedgerPreview = () => (
  <div class="preview" role="img" aria-label="Example evidence timeline for a sent message">
    <div class="preview-bar"><div class="dots"><i /><i /><i /></div><span>Message · Evidence timeline</span></div>
    <div class="pv-head">
      <div class="pv-sub">To: dana.whitfield@northgate-ins.com · Sent via claims@harborautobody.com</div>
      <div class="pv-subject">Supplement request — Claim #NG-448120, 2021 Subaru Outback</div>
      <div class="chips"><span class="chip ok">Delivered</span><span class="chip ok">Opened 3×</span><span class="chip">Estimate.pdf viewed</span><span class="chip warn">1 proxy open flagged</span></div>
    </div>
    <ol class="tl">
      <li><span class="dot" /><div><b>Accepted by provider</b><span>Resend · id 4f1c…a9e2</span></div><time>09:14:02</time></li>
      <li><span class="dot" /><div><b>Delivered to recipient's mail server</b><span>northgate-ins.com MX accepted</span></div><time>09:14:05</time></li>
      <li><span class="dot gold" /><div><b>Opened — privacy proxy</b><span>Loaded by a mail privacy proxy · marked uncertain</span></div><time>09:14:09</time></li>
      <li><span class="dot" /><div><b>Opened</b><span>Desktop · Outlook · network 203.0.113.0/24</span></div><time>10:02:47</time></li>
      <li><span class="dot" /><div><b>Secure file viewed</b><span>Estimate-Supplement-2.pdf (1.4 MB)</span></div><time>10:03:15</time></li>
    </ol>
    <div class="hash"><span>chain head 7c2e9f…41bd</span><span class="ok">✓ 5 events verified</span></div>
  </div>
);

const MessagesPreview = () => (
  <div class="preview" role="img" aria-label="Example message list">
    <div class="preview-bar"><div class="dots"><i /><i /><i /></div><span>Messages · Last 30 days</span></div>
    <div style="overflow-x:auto">
      <table class="mtable">
        <thead><tr><th>Recipient</th><th>Subject</th><th>Status</th><th>Latest</th></tr></thead>
        <tbody>
          <tr><td>m.ortega@lawrencellp.com</td><td>Notice of intent — Lease 14B</td><td><span class="status s-open">Opened</span></td><td>2m ago</td></tr>
          <tr><td>ap@cedarbuild.co</td><td>Invoice 2291 — Final draw</td><td><span class="status s-click">Link clicked</span></td><td>18m ago</td></tr>
          <tr><td>j.kim@northgate-ins.com</td><td>Photos &amp; teardown, RO 55812</td><td><span class="status s-deliv">Delivered</span></td><td>1h ago</td></tr>
          <tr><td>tenant.4417@gmail.com</td><td>Payment reminder — Unit 4417</td><td><span class="status s-bounce">Bounced</span></td><td>3h ago</td></tr>
        </tbody>
      </table>
    </div>
  </div>
);

const Feature = (p: { icon: keyof typeof Icons; title: string; body: string }) => {
  const Ic = Icons[p.icon];
  return <div class="card"><div class="icon"><Ic /></div><h3>{p.title}</h3><p>{p.body}</p></div>;
};

const CtaBand = () => (
  <section class="section-tight"><div class="wrap"><div class="band">
    <div><h2>Keep a record you can stand behind.</h2><p>Start with the web app today and bring in the API when you're ready. No card required for the trial.</p></div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:flex-end"><a class="btn btn-primary btn-lg" href="/app/signup">Start free trial</a><a class="btn btn-ghost btn-lg" href="/contact">Talk to sales</a></div>
  </div></div></section>
);

// ======================= HOME =======================
const FAQ: [string, string][] = [
  ["Does an \"opened\" event prove someone read my email?", "No. An open means a tracking image in the message was loaded. Many mail apps block images (so real opens go unrecorded), and privacy features like Apple Mail Privacy Protection or Gmail's image proxy can load images without the recipient opening anything. SentLedger flags proxy and automated loads as uncertain so you can weigh them properly."],
  ["What does SentLedger actually record?", "The exact content you sent (with SHA-256 fingerprints), who it went to, the sending provider's acceptance and delivery reports, and tracked events: image loads, link clicks, and secure-file views. Every event is added to a tamper-evident, hash-chained ledger that you can export as PDF, JSON or CSV."],
  ["Is this legally admissible evidence?", "SentLedger produces an organized, defensible record with transparent technical details — but it doesn't make anything automatically admissible. How records are used is up to you and your counsel."],
  ["Can I send from my own Gmail or Microsoft 365 account?", "Yes. Connect your inbox with OAuth and SentLedger sends through it, so the message appears in your Sent folder. Opens, clicks and file views are tracked; delivery and bounce reports aren't available from those providers, and we say so on each record."],
  ["Do recipients know tracking is used?", "You can require a tracking notice on every message, and SentLedger never hides tracking in deceptive ways. Recipients can unsubscribe where relevant, and we honor suppression lists automatically."],
  ["Can our software send through SentLedger?", "Yes. The REST API lets your platform create and send messages, attach secure files, pass your own metadata (claim numbers, case IDs, invoice numbers), and receive signed webhooks as events happen."],
];

export const Home = () => (
  <Layout path="/" title="Home" description="SentLedger keeps a clear, exportable record of every message you send: delivery, opens, link clicks, secure file views and a tamper-evident evidence timeline. Web app and developer API.">
    <section class="hero"><div class="wrap hero-grid">
      <div>
        <div class="eyebrow">Sent-message records</div>
        <h1>Know what was sent, what was delivered, and what happened next.</h1>
        <p class="lead">SentLedger sends your messages, tracks delivery, opens, link clicks and file views, and keeps it all in a tamper-evident timeline you can export whenever you need to show your work.</p>
        <div class="hero-cta"><a class="btn btn-primary btn-lg" href="/app/signup">Start free trial</a><a class="btn btn-ghost btn-lg" href="/app/login">Log in</a></div>
        <p class="fine">14-day trial · No card required · Works from the web app or your own software via API</p>
      </div>
      <LedgerPreview />
    </div></section>

    <div class="wrap"><div class="rule" /></div>
    <section class="section-tight"><div class="wrap">
      <div class="strip">
        <span>Built for</span><span>Auto body &amp; collision</span><span>·</span><span>Law firms</span><span>·</span><span>Contractors</span><span>·</span><span>Property managers</span><span>·</span><span>Collections</span><span>·</span><span>Sales teams</span><span>·</span><span>Software platforms</span>
      </div>
    </div></section>

    <section class="alt"><div class="wrap">
      <div class="center" style="margin-bottom:44px"><div class="eyebrow">One record per message</div><h2>Everything you'd want to know about a message you sent.</h2><p class="lead">Send it, track it, control it, and export the whole story — from one place.</p></div>
      <div class="grid g4">
        <Feature icon="send" title="Send from anywhere" body="Compose in the web app, send through your connected Gmail or Microsoft 365, or post to the API from your own software." />
        <Feature icon="eye" title="Track honestly" body="Opens, clicks and file views — each labeled with device type and flagged when a privacy proxy or scanner was involved." />
        <Feature icon="ledger" title="Evidence timeline" body="Every event is hash-chained to the one before it. Change anything and verification fails." />
        <Feature icon="lock" title="Secure files & links" body="Share files through expiring, revocable links instead of attachments, and see when each one was opened." />
        <Feature icon="plug" title="Connected inboxes" body="Send as yourself from Gmail or Microsoft 365, with least-privilege, send-only permissions." />
        <Feature icon="code" title="Developer API" body="Versioned REST API, scoped API keys, idempotent sends, signed webhooks and an OpenAPI spec." />
        <Feature icon="template" title="Templates" body="Reusable templates with merge fields, folders, version history and team sharing." />
        <Feature icon="users" title="Team controls" body="Workspaces, roles, invitations, audit logs and plan-level limits you can see." />
      </div>
    </div></section>

    <section><div class="wrap split">
      <div>
        <div class="eyebrow">Evidence ledger</div>
        <h2>A timeline you can hand to someone else.</h2>
        <p class="lead">Each message gets a durable ledger: content fingerprints, sender and recipients, provider IDs, every delivery and tracking event, and a plain-English explanation of what each event does and doesn't show.</p>
        <ul class="checks">
          <li>SHA-256 hashes of the final HTML and text bodies, frozen at send time</li>
          <li>Hash-chained events: remove or edit one and the chain breaks</li>
          <li>Export a PDF report, JSON, CSV, or a zipped package with a signed manifest</li>
          <li>Your own metadata — claim numbers, case IDs, invoice numbers — on every record</li>
        </ul>
      </div>
      <LedgerPreviewCompact />
    </div></section>

    <section class="alt"><div class="wrap split rev">
      <div>
        <div class="eyebrow">Web app + API</div>
        <h2>Use it yourself, or build it into your product.</h2>
        <p class="lead">Your team works in the SentLedger web app. Your software talks to the same system through the API. Either way, every message lands in the same ledger with the same event model.</p>
        <ul class="checks"><li>Scoped API keys, shown once and stored only as hashes</li><li>Idempotency keys make retries safe</li><li>Signed webhooks for sent, delivered, opened, clicked, file viewed, bounced and more</li></ul>
        <p style="margin-top:20px"><a href="/developers">Explore the API →</a></p>
      </div>
      <div><pre class="code">{raw(`<span class="c"># Send a tracked message and get its ledger</span>
curl ${env.PUBLIC_URL}/v1/messages \\
  -H <span class="s">"Authorization: Bearer $SENTLEDGER_KEY"</span> \\
  -H <span class="s">"Idempotency-Key: claim-NG-448120-supp-2"</span> \\
  -d <span class="s">'{
    "to": ["dana.whitfield@northgate-ins.com"],
    "subject": "Supplement request — Claim #NG-448120",
    "html": "&lt;p&gt;Please review the attached supplement.&lt;/p&gt;",
    "file_ids": ["f3b1…"],
    "metadata": { "claim_id": "NG-448120" },
    "send": true
  }'</span>

<span class="k">GET</span> /v1/messages/{id}/evidence?format=pdf`)}</pre></div>
    </div></section>

    <section><div class="wrap">
      <div class="center" style="margin-bottom:40px"><div class="eyebrow">Use cases</div><h2>For anyone who needs a record of what they sent.</h2></div>
      <div class="grid g3">
        <UseCaseCard icon="briefcase" title="Business operations" body="Invoices, notices, approvals and supplements with a timeline your office manager can pull up in seconds." />
        <UseCaseCard icon="scale" title="Legal & compliance" body="Organized, exportable records of notices and correspondence, with honest labels on what each event means." />
        <UseCaseCard icon="chart" title="Sales" body="Know when proposals and quotes are opened and which links got attention — without guessing." />
        <UseCaseCard icon="wrench" title="Service businesses" body="Body shops, contractors and property managers: estimates, photos and documents through secure, trackable links." />
        <UseCaseCard icon="cpu" title="Software platforms" body="Add sent-message evidence to your product through the API, with your own IDs on every record." />
        <UseCaseCard icon="building" title="Collections & notices" body="Consistent, suppression-aware sending with unsubscribe handling and a durable history per contact." />
      </div>
      <p class="center" style="margin-top:28px"><a href="/use-cases">See use cases in detail →</a></p>
    </div></section>

    <section class="alt"><div class="wrap split">
      <div><div class="eyebrow">Messages</div><h2>Find any message in seconds.</h2><p class="lead">Search by recipient, subject, tag, source, date or your own metadata. Filter to what was opened, clicked, bounced — or never opened at all.</p>
        <ul class="checks"><li>Dashboard with sends, delivery, opens, clicks and failures over time</li><li>Per-contact communication history</li><li>Resend, duplicate, archive, revoke — with permissions</li></ul></div>
      <MessagesPreview />
    </div></section>

    <section id="faq"><div class="wrap" style="max-width:820px">
      <div class="center" style="margin-bottom:24px"><div class="eyebrow">FAQ</div><h2>Straight answers about tracking.</h2></div>
      {FAQ.map(([q, a]) => <details><summary>{q}</summary><p>{a}</p></details>)}
    </div></section>
    <CtaBand />
  </Layout>
);

const LedgerPreviewCompact = () => (
  <div class="preview" role="img" aria-label="Evidence export summary">
    <div class="preview-bar"><div class="dots"><i /><i /><i /></div><span>Evidence export</span></div>
    <div style="padding:20px;display:grid;gap:14px">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><b>Notice of intent — Lease 14B</b><span class="badge">Chain verified</span></div>
      <div class="mono" style="color:var(--muted);line-height:1.8">
        html_sha256 3f7a91c0…e2b4<br />text_sha256 a0c4e19d…77f1<br />provider_id  re_8c1f…d0<br />metadata     {"{"}"lease":"14B","matter":"2291"{"}"}
      </div>
      <div class="grid g3" style="gap:10px">
        {["report.pdf", "ledger.json", "events.csv"].map((f) => <div class="card" style="padding:12px;box-shadow:none"><div style="display:flex;gap:8px;align-items:center;font-size:.86rem"><span style="width:16px;color:var(--accent)"><Icons.download /></span>{f}</div></div>)}
      </div>
      <div class="fine">manifest.json lists a SHA-256 for each file, so you can show nothing changed after export.</div>
    </div>
  </div>
);

const UseCaseCard = (p: { icon: keyof typeof Icons; title: string; body: string }) => {
  const Ic = Icons[p.icon];
  return <div class="card"><div class="icon"><Ic /></div><h3>{p.title}</h3><p>{p.body}</p></div>;
};

// ======================= FEATURES =======================
export const Features = () => (
  <Layout path="/features" title="Features" description="Send, track, secure files, evidence timelines, connected Gmail and Microsoft 365, templates, analytics, API and team controls.">
    <section class="hero"><div class="wrap" style="max-width:860px">
      <div class="eyebrow">Features</div><h1>Everything between "send" and "prove it."</h1>
      <p class="lead">SentLedger combines sending, tracking and record-keeping in one system, so the record is created as the message goes out — not reconstructed later.</p>
    </div></section>
    {[
      { k: "01", t: "Send", d: "Compose with a rich editor, templates and merge fields. Send now or schedule. Choose a verified sender on your own domain, your connected Gmail or Microsoft 365 account, or the SentLedger platform sender while you set up DNS.", items: ["To, CC, BCC, reply-to, tags and custom metadata", "Individually tracked copies or a single group email", "Desktop and mobile preview before sending", "Rate controls and suppression checks on every send"] },
      { k: "02", t: "Track", d: "Per-recipient opens, link clicks and secure-file views, recorded with a privacy-safe device category and a truncated network prefix. Proxy loads and automated scanners are flagged as uncertain rather than counted as reads.", items: ["Apple Mail Privacy Protection and Gmail image proxy detection", "De-duplication that keeps the raw event for audit", "Delivery, bounce and complaint events from the sending provider", "Tracking can be switched off per message"] },
      { k: "03", t: "Secure files", d: "Files are stored privately and shared through hosted, expiring links. Every view and download is a ledger event. Revoke access at any time.", items: ["Private storage with short-lived signed URLs", "Per-recipient links, expiry dates and revocation", "Blocked executable types and a malware-scan integration point", "SHA-256 fingerprint for every file"] },
      { k: "04", t: "Evidence ledger", d: "An append-only, hash-chained event history for every message, with content fingerprints taken at send time. Export a readable PDF report plus machine-readable JSON and CSV.", items: ["Sent content can never be silently edited", "Integrity verification on every export", "Zipped evidence package with a SHA-256 manifest", "Plain-language disclaimer explaining each event"] },
      { k: "05", t: "Team & controls", d: "Workspaces for each business, with roles for owners, admins, members, viewers and billing contacts. Security-sensitive actions go to the audit log.", items: ["Invite by email; transfer ownership", "Owner, Admin, Member, Viewer and Billing roles", "Audit log of logins, keys, sends, exports and billing", "Retention settings by plan"] },
      { k: "06", t: "Analytics", d: "See sends, delivery, opens, clicks, file views, bounces and failures over any date range, with top templates and top links.", items: ["Trend charts and recent activity", "Uncertain opens shown separately", "Plan usage and trial status at a glance", "Filter messages by engagement"] },
    ].map((s, i) => (
      <section class={i % 2 ? "alt" : ""}><div class="wrap split">
        <div><div class="kicker"><span class="n">{s.k}</span><div class="eyebrow">{s.t}</div></div><h2>{s.t}</h2><p class="lead">{s.d}</p></div>
        <ul class="checks card">{s.items.map((x) => <li>{x}</li>)}</ul>
      </div></section>
    ))}
    <CtaBand />
  </Layout>
);

// ======================= PRICING =======================
type PlanRow = { id: string; name: string; description: string | null; price_monthly_cents: number | null; price_annual_cents: number | null; entitlements: any };
const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: c % 100 ? 2 : 0 })}`;
const fmtLimit = (v: number | null | undefined, unit: string) => (v == null ? `Custom ${unit}` : `${v.toLocaleString()} ${unit}`);

export const Pricing = ({ plans }: { plans: PlanRow[] }) => {
  const paid = plans.filter((p) => p.id !== "trial");
  return (
    <Layout path="/pricing" title="Pricing" description="Start with a free trial. Monthly and annual plans with clear limits on sends, storage, seats, API access and retention.">
      <section class="hero"><div class="wrap center">
        <div class="eyebrow">Pricing</div><h1>Start free. Pick a plan when you're ready.</h1>
        <p class="lead">Every workspace starts with a 14-day trial — no card required, and nothing is charged unless you choose a plan. Annual billing is available on every plan.</p>
        <div class="toggle" data-billing-toggle role="group" aria-label="Billing interval"><button type="button" aria-pressed="true" data-interval="month">Monthly</button><button type="button" aria-pressed="false" data-interval="year">Annual</button></div>
        <div class="plans" style="text-align:left">
          {paid.map((p) => {
            const e = p.entitlements ?? {};
            const custom = e.contact_sales;
            const m = p.price_monthly_cents != null ? money(p.price_monthly_cents) : null;
            const y = p.price_annual_cents != null ? money(p.price_annual_cents) : null;
            return (
              <div class={`card plan ${p.id === "pro" ? "featured" : ""}`}>
                {p.id === "pro" && <span class="badge" style="align-self:flex-start;margin-bottom:8px">Most popular</span>}
                <h3 style="font-size:1.15rem">{p.name}</h3>
                <p style="font-size:.9rem;min-height:2.8em">{p.description}</p>
                {custom ? <><div class="price">Custom</div><div class="per">Volume, retention and contract terms</div></>
                  : m || y ? <><div class="price" data-m={m ?? "—"} data-y={y ?? "—"}>{m ?? "—"}</div><div class="per" data-per data-perm="per month" data-pery="per year">per month</div></>
                  : <><div class="price" style="font-size:1.35rem">Pricing coming soon</div><div class="per">Start a trial now — we'll confirm pricing before any charge.</div></>}
                <ul>
                  <li>{fmtLimit(e.monthly_sends, "sends / month")}</li>
                  <li>{fmtLimit(e.seats, "team seats")}</li>
                  <li>{e.attachment_storage_mb == null ? "Custom file storage" : `${(e.attachment_storage_mb / 1000).toLocaleString()} GB secure file storage`}</li>
                  <li>{e.retention_days == null ? "Custom retention" : `${Math.round(e.retention_days / 365 * 10) / 10 >= 1 ? `${Math.round(e.retention_days / 365 * 10) / 10}-year` : `${e.retention_days}-day`} record retention`}</li>
                  <li>{e.api_access ? "API access & webhooks" : "Web app only"}</li>
                  <li>{fmtLimit(e.connected_inboxes, "connected inboxes")}</li>
                  <li>{e.custom_branding ? "Custom branding" : "SentLedger branding"}</li>
                  <li>{e.overage_allowed ? "Overage available" : "Hard monthly limit"}</li>
                </ul>
                {custom ? <a class="btn btn-ghost" href="/contact?topic=enterprise">Contact sales</a> : <a class={`btn ${p.id === "pro" ? "btn-primary" : "btn-ghost"}`} href={`/app/signup?plan=${p.id}`}>Start free trial</a>}
              </div>
            );
          })}
        </div>
      </div></section>
      <section class="alt"><div class="wrap" style="max-width:820px">
        <h2 class="center">Billing questions</h2>
        <details><summary>When will I be charged?</summary><p>Never during the trial unless you choose a plan. If you subscribe before the trial ends, your first charge happens when the trial ends.</p></details>
        <details><summary>What happens if I hit my plan limit?</summary><p>Plans with overage keep sending; others pause new sends until the next period or an upgrade. Your existing records are never deleted because of a limit.</p></details>
        <details><summary>Can I cancel anytime?</summary><p>Yes. Cancel from the billing portal and your plan stays active until the end of the period you've paid for.</p></details>
        <details><summary>Do you offer invoices and annual billing?</summary><p>Yes — every plan has annual billing, and invoices and receipts are available in the app and by email.</p></details>
      </div></section>
      <CtaBand />
    </Layout>
  );
};

// ======================= SECURITY =======================
export const Security = () => (
  <Layout path="/security" title="Security & privacy" description="How SentLedger protects your data, what tracking can and can't tell you, and how we handle recipient privacy.">
    <section class="hero"><div class="wrap" style="max-width:860px">
      <div class="eyebrow">Security &amp; privacy</div><h1>Built to be trusted by both sides of the message.</h1>
      <p class="lead">Your records need to be secure, and your recipients deserve honesty. Here's how SentLedger handles both.</p>
    </div></section>
    <section class="alt"><div class="wrap grid g3">
      <Feature icon="shield" title="Tenant isolation" body="Every record belongs to one workspace. Row-level security in the database blocks cross-workspace reads even if application code were wrong." />
      <Feature icon="lock" title="Encryption" body="TLS in transit, encryption at rest, and AES-256-GCM for OAuth tokens and webhook secrets, with keys held only in the server environment." />
      <Feature icon="hash" title="Hashed secrets" body="API keys are shown once and stored only as SHA-256 hashes. Webhooks are signed with HMAC-SHA256 and a timestamp." />
      <Feature icon="ledger" title="Append-only ledger" body="Events can't be edited or deleted by the application; each is chained to the previous event's hash." />
      <Feature icon="users" title="Least privilege" body="Five roles, scoped API keys, send-only inbox permissions, and a full audit log of sensitive actions." />
      <Feature icon="file" title="Private files" body="Files live in private storage and are served only through short-lived signed links after an access check." />
    </div></section>
    <section id="limits"><div class="wrap" style="max-width:920px">
      <div class="eyebrow">Tracking limitations</div><h2>What tracking can't tell you.</h2>
      <p class="lead">We'd rather you understand these limits than overstate what a record shows.</p>
      <div class="limits" style="margin-top:24px">
        <div><b>Image blocking</b><p>Many mail apps don't load images until the reader allows it. Real opens can go unrecorded.</p></div>
        <div><b>Privacy proxies</b><p>Apple Mail Privacy Protection and Gmail's image proxy can load images automatically. We flag these as uncertain.</p></div>
        <div><b>Security scanners</b><p>Corporate email security can click links to check them. Very fast clicks and known scanners are flagged.</p></div>
        <div><b>Forwarding</b><p>If a message is forwarded, opens and clicks may come from someone other than the original recipient.</p></div>
        <div><b>Location</b><p>We store a truncated network prefix only. SentLedger does not identify people or precise locations from IP addresses.</p></div>
        <div><b>Connected inboxes</b><p>Gmail and Microsoft 365 don't report delivery or bounces to us; those arrive in your own mailbox instead.</p></div>
      </div>
    </div></section>
    <section class="alt"><div class="wrap" style="max-width:860px">
      <h2>Recipient privacy</h2>
      <ul class="checks"><li>Workspaces can require a visible tracking notice on every message</li><li>Unsubscribe links and one-click List-Unsubscribe for multi-recipient sends</li><li>Bounces, complaints and unsubscribes are suppressed automatically</li><li>Full IP addresses are never stored with tracking events</li><li>Retention limits remove old records automatically</li></ul>
      <p style="margin-top:20px">Found a vulnerability? Email <a href="mailto:security@sentledger.com">security@sentledger.com</a>. Received a message you believe is abusive? <a href="/abuse">Report it here</a>.</p>
    </div></section>
    <CtaBand />
  </Layout>
);

// ======================= DEVELOPERS =======================
const snippet = (lang: string) => {
  const base = env.PUBLIC_URL;
  const body = `{"to":["recipient@example.com"],"subject":"Your estimate","html":"<p>Hi {{name}}, your estimate is ready.</p>","variables":{"name":"Alex"},"metadata":{"order_id":"A-1001"},"send":true}`;
  if (lang === "curl") return `curl ${base}/v1/messages \\\n  -H "Authorization: Bearer $SENTLEDGER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: order-A-1001-estimate" \\\n  -d '${body}'`;
  if (lang === "ts") return `const res = await fetch("${base}/v1/messages", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${process.env.SENTLEDGER_API_KEY}\`,\n    "Content-Type": "application/json",\n    "Idempotency-Key": "order-A-1001-estimate",\n  },\n  body: JSON.stringify({\n    to: ["recipient@example.com"],\n    subject: "Your estimate",\n    html: "<p>Hi {{name}}, your estimate is ready.</p>",\n    variables: { name: "Alex" },\n    metadata: { order_id: "A-1001" },\n    send: true,\n  }),\n});\nconst message = await res.json();\n\n// Later: fetch the evidence ledger\nconst ledger = await fetch(\`${base}/v1/messages/\${message.id}/evidence\`, {\n  headers: { Authorization: \`Bearer \${process.env.SENTLEDGER_API_KEY}\` },\n}).then((r) => r.json());`;
  if (lang === "py") return `import os, requests\n\nr = requests.post(\n    "${base}/v1/messages",\n    headers={\n        "Authorization": f"Bearer {os.environ['SENTLEDGER_API_KEY']}",\n        "Idempotency-Key": "order-A-1001-estimate",\n    },\n    json={\n        "to": ["recipient@example.com"],\n        "subject": "Your estimate",\n        "html": "<p>Hi {{name}}, your estimate is ready.</p>",\n        "variables": {"name": "Alex"},\n        "metadata": {"order_id": "A-1001"},\n        "send": True,\n    },\n)\nmessage = r.json()\nledger = requests.get(\n    f"${base}/v1/messages/{message['id']}/evidence",\n    headers={"Authorization": f"Bearer {os.environ['SENTLEDGER_API_KEY']}"},\n).json()`;
  return `<?php\n$ch = curl_init("${base}/v1/messages");\ncurl_setopt_array($ch, [\n  CURLOPT_POST => true,\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_HTTPHEADER => [\n    "Authorization: Bearer " . getenv("SENTLEDGER_API_KEY"),\n    "Content-Type: application/json",\n    "Idempotency-Key: order-A-1001-estimate",\n  ],\n  CURLOPT_POSTFIELDS => json_encode([\n    "to" => ["recipient@example.com"],\n    "subject" => "Your estimate",\n    "html" => "<p>Hi {{name}}, your estimate is ready.</p>",\n    "variables" => ["name" => "Alex"],\n    "metadata" => ["order_id" => "A-1001"],\n    "send" => true,\n  ]),\n]);\n$message = json_decode(curl_exec($ch), true);`;
};

const verifySnippet = `import crypto from "node:crypto";

// Express/Hono/etc: use the RAW request body.
export function verifySentLedger(rawBody: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false; // 5-minute tolerance
  const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1 ?? ""));
}`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const Developers = () => (
  <Layout path="/developers" title="API & developers" description="SentLedger REST API: send messages, upload secure files, retrieve evidence ledgers and receive signed webhooks. Scoped API keys and idempotent requests.">
    <section class="hero"><div class="wrap split">
      <div>
        <div class="eyebrow">API &amp; developers</div><h1>Sent-message evidence, as an API.</h1>
        <p class="lead">Create and send messages from your own software, attach secure files, tag everything with your own IDs, and pull back a verifiable ledger — the same records your users see in the web app.</p>
        <div class="hero-cta"><a class="btn btn-primary" href="/app/signup?intent=api">Get an API key</a><a class="btn btn-ghost" href="/developers/reference">API reference</a></div>
        <p class="fine">Base URL <span class="mono">{env.PUBLIC_URL}/v1</span> · <a href="/v1/openapi.json">OpenAPI 3.1 spec</a></p>
      </div>
      <div>
        <div class="tabs" data-tabs role="tablist" aria-label="Code examples">
          {[["curl", "cURL"], ["ts", "TypeScript"], ["py", "Python"], ["php", "PHP"]].map(([k, l], i) => <button type="button" role="tab" id={`tab-${k}`} aria-controls={`code-${k}`} aria-selected={i === 0 ? "true" : "false"}>{l}</button>)}
        </div>
        {["curl", "ts", "py", "php"].map((k, i) => <pre class="code" id={`code-${k}`} role="tabpanel" aria-labelledby={`tab-${k}`} hidden={i !== 0}>{snippet(k)}</pre>)}
      </div>
    </div></section>
    <section class="alt"><div class="wrap">
      <h2>Quickstart</h2>
      <div class="grid g3" style="margin-top:24px">
        <div class="card"><div class="kicker"><span class="n">1</span><h3>Create a key</h3></div><p>In the app, go to <b>API &amp; Webhooks → New key</b>. Choose scopes like <span class="mono">messages:write</span> and <span class="mono">events:read</span>. The secret is shown once.</p></div>
        <div class="card"><div class="kicker"><span class="n">2</span><h3>Send a message</h3></div><p><span class="mono">POST /v1/messages</span> with <span class="mono">"send": true</span>. Add an <span class="mono">Idempotency-Key</span> header so retries never double-send.</p></div>
        <div class="card"><div class="kicker"><span class="n">3</span><h3>Read the ledger</h3></div><p><span class="mono">GET /v1/messages/:id/evidence</span> returns JSON, or add <span class="mono">?format=pdf|csv|zip</span> for exports.</p></div>
      </div>
    </div></section>
    <section><div class="wrap grid g2" style="align-items:start">
      <div>
        <h2>Authentication &amp; scopes</h2>
        <p>Send <span class="mono">Authorization: Bearer sl_live_…</span>. Each key belongs to one workspace and carries only the scopes you grant. Keys can expire, be restricted to IP addresses, and be revoked instantly.</p>
        <p class="mono" style="line-height:1.9">messages:write · messages:read · events:read · contacts:read · contacts:write · files:write · files:read · templates:read · templates:write · webhooks:manage · billing:read</p>
        <h3 style="margin-top:28px">Conventions</h3>
        <ul class="checks"><li>Errors: <span class="mono">{"{"} error: {"{"} code, message, details, request_id {"}"} {"}"}</span></li><li>Cursor pagination with <span class="mono">limit</span>, <span class="mono">cursor</span>, <span class="mono">from</span>, <span class="mono">to</span></li><li>Rate limits reported in <span class="mono">X-RateLimit-*</span> headers</li><li>Idempotency: same key + same body replays; different body → 409</li></ul>
      </div>
      <div id="webhooks">
        <h2>Webhooks</h2>
        <p>Subscribe to <span class="mono">message.sent</span>, <span class="mono">delivered</span>, <span class="mono">opened</span>, <span class="mono">clicked</span>, <span class="mono">file_viewed</span>, <span class="mono">bounced</span>, <span class="mono">failed</span>, <span class="mono">revoked</span> and <span class="mono">billing.usage_threshold</span>. Every delivery is signed; failures retry 8 times over about 45 hours, and you can replay any delivery from the dashboard.</p>
        <pre class="code">{raw(esc(verifySnippet))}</pre>
      </div>
    </div></section>
    <section class="alt"><div class="wrap" style="max-width:860px">
      <h2>Browser extensions &amp; integrations</h2>
      <p>Extensions (Chrome, Thunderbird) and partner integrations use a device-authorization flow: the client requests a code from <span class="mono">POST /v1/device/code</span>, the user approves it at <span class="mono">/app/device</span>, and the client receives a scoped key from <span class="mono">POST /v1/device/token</span>. Every client reports into the same message and event model.</p>
    </div></section>
    <CtaBand />
  </Layout>
);

export const Reference = () => (
  <html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>API reference · SentLedger</title><link rel="icon" href="/favicon.svg" /></head>
    <body><script id="api-reference" data-url="/v1/openapi.json"></script><script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1"></script></body></html>
);

// ======================= INTEGRATIONS =======================
export const Integrations = () => (
  <Layout path="/integrations" title="Integrations" description="Send through Gmail, Microsoft 365 or SentLedger-managed sending from your own domain. Connect your software with the API and webhooks.">
    <section class="hero"><div class="wrap" style="max-width:860px"><div class="eyebrow">Integrations</div><h1>Send the way you already work.</h1><p class="lead">Three ways to send, one ledger. Pick per message.</p></div></section>
    <section class="alt"><div class="wrap grid g3">
      <div class="card"><div class="icon"><Icons.mail /></div><h3>Gmail &amp; Google Workspace</h3><p>Connect with OAuth using the send-only Gmail scope. Messages go out from your account and appear in your Sent folder.</p><p class="fine" style="margin-top:12px">Tracked: opens, clicks, file views. Not available from Google: delivery and bounce reports.</p></div>
      <div class="card"><div class="icon"><Icons.mail /></div><h3>Microsoft 365 &amp; Outlook</h3><p>Connect with Microsoft identity using <span class="mono">Mail.Send</span>. Messages are saved to your Sent Items.</p><p class="fine" style="margin-top:12px">Tracked: opens, clicks, file views. Not available from Microsoft: message IDs, delivery and bounce reports.</p></div>
      <div class="card"><div class="icon"><Icons.send /></div><h3>SentLedger sending</h3><p>Send from your own verified domain with SPF, DKIM and DMARC guidance — or from the SentLedger platform sender while DNS is pending.</p><p class="fine" style="margin-top:12px">Tracked: acceptance, delivery, bounces, complaints, opens, clicks and file views.</p></div>
    </div></section>
    <section><div class="wrap grid g3">
      <Feature icon="code" title="REST API" body="Everything in the web app is available through /v1 with scoped keys." />
      <Feature icon="plug" title="Webhooks" body="Signed, retried, replayable event delivery to your systems." />
      <Feature icon="cpu" title="Extensions (coming soon)" body="Chrome and Thunderbird extensions are on the roadmap and will use the same records and API." />
    </div></section>
    <CtaBand />
  </Layout>
);

// ======================= USE CASES =======================
export const UseCases = () => (
  <Layout path="/use-cases" title="Use cases" description="How body shops, law firms, contractors, property managers, collections teams, sales teams and software platforms use SentLedger.">
    <section class="hero"><div class="wrap" style="max-width:860px"><div class="eyebrow">Use cases</div><h1>One system. Many kinds of paper trail.</h1><p class="lead">SentLedger isn't built for one industry. Templates and custom metadata let each team keep records in its own terms.</p></div></section>
    {[
      { t: "Auto body & collision", d: "Send supplements, estimates and teardown photos to adjusters through secure links. Tag each message with claim and RO numbers, and pull a timeline when a claim stalls.", m: 'metadata: {"claim_id":"NG-448120","ro":"55812"}' },
      { t: "Legal & compliance teams", d: "Send notices and correspondence with frozen content hashes and an exportable report that explains precisely what each event does — and doesn't — show.", m: 'metadata: {"matter":"2291","notice_type":"intent"}' },
      { t: "Contractors & trades", d: "Change orders, lien notices and invoices with file views you can see, plus a per-client communication history.", m: 'metadata: {"job":"Cedar-4","draw":"final"}' },
      { t: "Property managers", d: "Lease notices and payment reminders with suppression and unsubscribe handling built in, and records retained by policy.", m: 'metadata: {"unit":"4417","lease":"14B"}' },
      { t: "Sales teams", d: "Know when a proposal is opened and which links got attention — while seeing which opens might be proxies, not people.", m: 'metadata: {"deal":"Q3-ACME","stage":"proposal"}' },
      { t: "Software platforms", d: "Embed sent-message evidence in your product with the API, webhooks and your own correlation IDs.", m: 'correlation_id: "your-system-ref-8812"' },
    ].map((u, i) => (
      <section class={i % 2 ? "alt" : ""}><div class="wrap split"><div><h2>{u.t}</h2><p class="lead">{u.d}</p></div><pre class="code">{u.m}</pre></div></section>
    ))}
    <CtaBand />
  </Layout>
);

// ======================= CONTACT / ABUSE =======================
export const Contact = ({ topic }: { topic?: string }) => (
  <Layout path="/contact" title="Contact sales" description="Talk to SentLedger about plans, enterprise volume, security reviews or support.">
    <section class="hero"><div class="wrap split" style="align-items:start">
      <div><div class="eyebrow">Contact</div><h1>Let's talk.</h1><p class="lead">Questions about plans, enterprise volume, security reviews, or getting set up? Send a note and a person will reply.</p>
        <p>Support: <a href="mailto:support@sentledger.com">support@sentledger.com</a><br />Security: <a href="mailto:security@sentledger.com">security@sentledger.com</a></p></div>
      <form class="card form" data-api="/v1/public/contact" data-success="Thanks — we'll get back to you within one business day.">
        <label>Name<input name="name" required maxlength={120} autocomplete="name" /></label>
        <label>Work email<input name="email" type="email" required autocomplete="email" /></label>
        <label>Company<input name="company" maxlength={200} autocomplete="organization" /></label>
        <label>Topic<select name="topic">{["sales", "enterprise", "support", "partnership", "other"].map((t) => <option value={t} selected={t === (topic ?? "sales")}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}</select></label>
        <label>How can we help?<textarea name="message" required minlength={5} maxlength={5000} /></label>
        <input class="hp" name="website" tabindex={-1} autocomplete="off" aria-hidden="true" />
        <button class="btn btn-primary" type="submit">Send message</button>
        <div data-result hidden role="status" />
      </form>
    </div></section>
  </Layout>
);

export const Abuse = () => (
  <Layout path="/abuse" title="Report abuse" description="Report spam, phishing or other abuse sent through SentLedger.">
    <section class="hero"><div class="wrap split" style="align-items:start">
      <div><div class="eyebrow">Trust &amp; safety</div><h1>Report abuse</h1><p class="lead">If you received spam, phishing or harassment sent through SentLedger, tell us. Include the message ID from the email headers (<span class="mono">X-SentLedger-Message-Id</span>) if you have it.</p></div>
      <form class="card form" data-api="/v1/public/abuse" data-success="Thank you. Our team will review this report.">
        <label>Your email (optional)<input name="reporter_email" type="email" /></label>
        <label>Reason<select name="reason" required>{["spam", "phishing", "harassment", "malware", "privacy", "other"].map((r) => <option value={r}>{r[0]!.toUpperCase() + r.slice(1)}</option>)}</select></label>
        <label>Message ID (optional)<input name="message_reference" maxlength={200} /></label>
        <label>Details<textarea name="details" required minlength={5} /></label>
        <input class="hp" name="website" tabindex={-1} autocomplete="off" aria-hidden="true" />
        <button class="btn btn-primary" type="submit">Submit report</button>
        <div data-result hidden role="status" />
      </form>
    </div></section>
  </Layout>
);
