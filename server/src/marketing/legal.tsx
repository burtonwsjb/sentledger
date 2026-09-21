/** @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import { Layout } from "./layout";

const UPDATED = "September 21, 2026";

const Legal = (p: { path: string; title: string; description: string; children: Child }) => (
  <Layout path={p.path} title={p.title} description={p.description}>
    <section class="hero"><div class="wrap prose">
      <div class="eyebrow">Legal</div><h1>{p.title}</h1><p class="fine">Last updated {UPDATED}</p>
      {p.children}
      <p style="margin-top:3em">Questions? Contact <a href="mailto:legal@sentledger.com">legal@sentledger.com</a>.</p>
    </div></section>
  </Layout>
);

export const Terms = () => (
  <Legal path="/legal/terms" title="Terms of Service" description="The terms that govern use of SentLedger.">
    <p>These Terms of Service ("Terms") govern your access to and use of the SentLedger website, web application, API and related services (the "Service"). By creating an account or using the Service, you agree to these Terms on behalf of yourself and any organization you represent ("Customer", "you").</p>
    <h2>1. Accounts and workspaces</h2>
    <p>You must provide accurate information and keep your credentials secure. Each workspace is controlled by its owner, who may invite users and assign roles. You are responsible for activity in your workspace, including activity through API keys you create.</p>
    <h2>2. Your content and data</h2>
    <p>You retain all rights to the messages, files, contacts and other data you submit ("Customer Data"). You grant SentLedger a limited license to host, process, transmit and display Customer Data solely to provide and secure the Service. You are responsible for having the rights and any consents required to send messages and process recipients' information, including any notice or consent required for tracking under laws that apply to you.</p>
    <h2>3. Tracking records are technical records</h2>
    <p>The Service records technical events such as provider acceptance, delivery reports, image loads, link requests and file access. These events can be affected by image blocking, privacy proxies, security scanners, forwarding and client behavior. SentLedger does not represent that any event proves a person received, opened, read or understood a message, and does not warrant that records will be admissible or persuasive in any proceeding.</p>
    <h2>4. Acceptable use</h2>
    <p>You must follow the <a href="/legal/acceptable-use">Acceptable Use Policy</a>. We may suspend sending or accounts that create risk to the Service, recipients or other customers, and will tell you when we do unless prohibited.</p>
    <h2>5. Plans, trials and billing</h2>
    <p>Trials are free and require no payment method. Paid plans are billed in advance monthly or annually through our payment processor. Plan limits and entitlements are shown in the app. Fees are non-refundable except where required by law. You may cancel at any time; cancellation takes effect at the end of the current billing period. We may change prices with at least 30 days' notice before your next renewal.</p>
    <h2>6. Data retention and deletion</h2>
    <p>Records are retained according to your plan's retention period and your workspace settings, then deleted. The owner may request deletion of the workspace; deletion is completed after a 30-day grace period. You can export records at any time before deletion.</p>
    <h2>7. Third-party services</h2>
    <p>If you connect Gmail, Microsoft 365 or other services, your use of those services is governed by their terms. We access connected accounts only to provide the features you use.</p>
    <h2>8. Availability and changes</h2>
    <p>We work to keep the Service available and secure but do not guarantee uninterrupted operation. We may improve or change features; we will not materially reduce core functionality of a paid plan during its current term.</p>
    <h2>9. Disclaimers</h2>
    <p>Except as expressly stated, the Service is provided "as is" without warranties of any kind, including merchantability, fitness for a particular purpose and non-infringement.</p>
    <h2>10. Limitation of liability</h2>
    <p>To the extent permitted by law, neither party is liable for indirect, incidental, special, consequential or punitive damages, or lost profits or data, and SentLedger's total liability for any claim is limited to the fees you paid for the Service in the 12 months before the claim arose.</p>
    <h2>11. Termination</h2>
    <p>You may stop using the Service at any time. We may terminate for material breach not cured within 30 days of notice, or immediately for serious violations of the Acceptable Use Policy.</p>
    <h2>12. Changes to these Terms</h2>
    <p>We may update these Terms. If a change is material, we will notify workspace owners at least 30 days before it takes effect.</p>
  </Legal>
);

export const Privacy = () => (
  <Legal path="/legal/privacy" title="Privacy Policy" description="How SentLedger collects, uses and protects personal information.">
    <p>This policy explains how SentLedger handles personal information about our customers and their users ("Account Data") and about the people our customers send messages to ("Recipients").</p>
    <h2>Two roles</h2>
    <p>For Account Data, SentLedger is the controller. For Customer Data — including message content, recipient addresses and tracking events — SentLedger processes information on behalf of our customer, who decides what is sent and to whom. Recipients with questions about a specific message should contact the sender; we will assist our customers with those requests.</p>
    <h2>What we collect</h2>
    <ul>
      <li><b>Account Data:</b> name, email, workspace details, role, timezone, notification settings, billing contact and payment status (card details are handled by our payment processor, not stored by us).</li>
      <li><b>Customer Data:</b> messages, files, templates, contacts, metadata our customers attach, and records of delivery and engagement.</li>
      <li><b>Tracking event data:</b> time of an event, event type, a device category derived from the user agent, the user agent string, a truncated network prefix (for example 203.0.113.0/24) and a keyed hash used only for de-duplication. We do not store full IP addresses with tracking events, and we do not identify individuals or precise locations from them.</li>
      <li><b>Connected account tokens:</b> OAuth tokens for Gmail or Microsoft 365, encrypted at rest, used only to send messages you request.</li>
      <li><b>Operational data:</b> security logs, audit logs and error reports.</li>
    </ul>
    <h2>How we use it</h2>
    <p>To provide, secure and support the Service; to process payments; to prevent abuse; to communicate about your account; and to comply with law. We do not sell personal information, and we do not use Customer Data to advertise.</p>
    <h2>Sharing</h2>
    <p>We share information with service providers that help us run the Service — hosting and database (Railway, Supabase), email delivery (Resend), payments (Stripe) and error monitoring — under contracts that limit their use of it. We may disclose information if required by law or to protect people and the Service.</p>
    <h2>Retention</h2>
    <p>Customer Data is kept for the retention period of the customer's plan and settings, then deleted. Account Data is kept while the account is active and for a limited period afterwards for legal and accounting purposes.</p>
    <h2>Security</h2>
    <p>We use encryption in transit and at rest, workspace isolation enforced in the database, encrypted secrets, hashed API keys, role-based access and audit logging. See <a href="/security">Security</a>.</p>
    <h2>Your choices and rights</h2>
    <p>Depending on where you live, you may have rights to access, correct, delete or export your information, or to object to certain processing. Account holders can manage most of this in the app. Recipients can unsubscribe where a link is provided, or contact the sender. Contact <a href="mailto:privacy@sentledger.com">privacy@sentledger.com</a> for help.</p>
    <h2>International transfers</h2>
    <p>Our infrastructure is primarily located in the United States. Where required, we use appropriate safeguards for international transfers.</p>
    <h2>Children</h2>
    <p>The Service is not directed to children and we do not knowingly collect information from children.</p>
  </Legal>
);

export const AcceptableUse = () => (
  <Legal path="/legal/acceptable-use" title="Acceptable Use Policy" description="What you may and may not do with SentLedger.">
    <p>SentLedger is for legitimate business and personal communications that need a reliable record. To protect recipients and our sending reputation, you may not use the Service to:</p>
    <ul>
      <li>Send unsolicited bulk email, purchased or scraped lists, or messages to recipients who have not agreed to hear from you where consent is required.</li>
      <li>Send phishing, fraud, malware, or content that impersonates another person or organization.</li>
      <li>Harass, threaten, stalk or intimidate anyone, or send content that is unlawful, defamatory or infringing.</li>
      <li>Hide or misrepresent tracking in a way that is deceptive or unlawful where you operate, or ignore unsubscribe requests and suppression lists.</li>
      <li>Attempt to access other workspaces, probe or overload the Service, or bypass rate limits, plan limits or security controls.</li>
      <li>Use SentLedger records to mislead others about what they show, such as presenting an image load as proof that a specific person read a message.</li>
    </ul>
    <h2>Enforcement</h2>
    <p>We monitor bounce and complaint rates and review abuse reports. We may pause sending, suspend API keys or accounts, or terminate service for violations. To report abuse, use <a href="/abuse">our abuse form</a>.</p>
  </Legal>
);

export const Cookies = () => (
  <Legal path="/legal/cookies" title="Cookie Policy" description="How SentLedger uses cookies and similar technologies.">
    <h2>On sentledger.com</h2>
    <p>Our marketing pages don't use advertising or analytics cookies. The SentLedger web app stores your sign-in session in your browser's local storage so you stay signed in; this is strictly necessary for the app to work and is removed when you sign out.</p>
    <h2>In messages sent through SentLedger</h2>
    <p>Messages may contain a tracking image and tracked links when the sender enables them. These don't set cookies. When loaded, they record the event described in our <a href="/legal/privacy">Privacy Policy</a>. You can prevent image-based tracking by turning off automatic image loading in your mail app.</p>
    <h2>Third parties</h2>
    <p>We load fonts from Google Fonts on marketing pages. When you pay, Stripe may set cookies on its own checkout pages under Stripe's policies.</p>
  </Legal>
);
