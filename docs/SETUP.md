# SentLedger production setup

Everything below is a one-time dashboard task. Items marked **(required)** are needed for the product to work at all; the rest switch features on.

## 1. Railway (required)

Project `email-pixel-tracker` → service **sentledger-web** (builds from this repo's `Dockerfile`).

Service → **Variables** → set:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PUBLIC_URL` | `https://sentledger.com` |
| `SUPABASE_URL` | `https://tbygetlorehzixstgnht.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role / `sb_secret_…` key (server only) |
| `ENCRYPTION_KEY` | output of `bun scripts/gen-secrets.ts` — **never change after launch** (encrypts OAuth tokens + webhook secrets) |
| `TRACKING_SECRET` | from `gen-secrets.ts` — changing it breaks links in already-sent mail |
| `IP_HASH_SALT` | from `gen-secrets.ts` |
| `PLATFORM_FROM_EMAIL` | `notifications@sentledger.com` |
| `PLATFORM_ADMIN_EMAILS` | your login email (grants /app/admin) |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | see §3 |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | see §4 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | see §5 |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | see §6 |
| `SENTRY_DSN` | optional error monitoring |
| `MALWARE_SCAN_URL` | optional file-scan endpoint (POST multipart `file`, returns `{ "clean": bool }`) |

Health check: `GET /healthz`.

## 2. DNS for sentledger.com at Namecheap (required)

Namecheap → Domain List → sentledger.com → **Manage** → **Advanced DNS**:
1. Delete the default `URL Redirect Record` and parking `CNAME www`.
2. Add **ALIAS Record** — Host `@` — Value `4lyc3d0b.up.railway.app`.
3. Add **CNAME Record** — Host `www` — Value `iynpyfoo.up.railway.app`.
Railway issues HTTPS certificates automatically once DNS resolves (minutes to a few hours).

## 3. Email delivery — Resend (required to send)

1. resend.com → **Domains → Add Domain** → `sentledger.com` (or `mail.sentledger.com`).
2. Copy the shown TXT/MX/CNAME records into Namecheap Advanced DNS; click **Verify**.
3. Add a DMARC record in Namecheap: TXT, host `_dmarc`, value `v=DMARC1; p=none; rua=mailto:dmarc@sentledger.com`.
4. **API Keys → Create** (Full access — needed for customer domain onboarding) → `RESEND_API_KEY`.
5. **Webhooks → Add endpoint** → `https://sentledger.com/webhooks/resend`, events: delivered, delivery_delayed, bounced, complained, failed → copy the signing secret → `RESEND_WEBHOOK_SECRET`.

## 4. Supabase Auth (required)

Dashboard → project **email-pixel-tracker**:
1. **Authentication → URL Configuration**: Site URL `https://sentledger.com/app`; Redirect URLs: `https://sentledger.com/app/**`.
2. **Authentication → Emails → SMTP Settings** → enable custom SMTP (Supabase's built-in mailer is limited to a few emails per hour):
   host `smtp.resend.com`, port `465`, user `resend`, password = a Resend API key, sender `SentLedger <notifications@sentledger.com>`.
3. **Authentication → Sign In / Providers → Email**: keep "Confirm email" on.
4. (Optional) **Authentication → Attack Protection**: enable CAPTCHA if signup abuse appears.

## 5. Stripe (billing)

1. Decide prices, edit `PRICES` in `scripts/stripe-setup.ts` (cents).
2. Stripe → Developers → API keys → Secret key → `STRIPE_SECRET_KEY`. Run:
   `STRIPE_SECRET_KEY=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… bun scripts/stripe-setup.ts`
3. Stripe → Developers → **Webhooks → Add endpoint** → `https://sentledger.com/webhooks/stripe`, events:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.finalized` → signing secret → `STRIPE_WEBHOOK_SECRET`.
4. Stripe → Settings → **Billing → Customer portal**: enable cancel (at period end), switch plans (add your products), update payment method, invoice history.
5. Stripe → Settings → Billing → **Subscriptions and emails**: enable failed-payment retries and receipt emails.
Test with test-mode keys first (card `4242 4242 4242 4242`).

## 6. Gmail connection (Google OAuth)

1. console.cloud.google.com → new project "SentLedger" → **APIs & Services → Library** → enable **Gmail API**.
2. **OAuth consent screen** → External → app name SentLedger, support email, domain sentledger.com, privacy `https://sentledger.com/legal/privacy`, terms `https://sentledger.com/legal/terms`. Scopes: `openid`, `email`, `https://www.googleapis.com/auth/gmail.send`.
3. **Credentials → Create OAuth client ID** → Web application → Authorized redirect URI `https://sentledger.com/oauth/gmail/callback` → copy ID/secret.
4. `gmail.send` is a *sensitive* scope: while unverified, only test users you add can connect (max 100). Submit for verification before public launch.

## 7. Microsoft 365 connection

1. portal.azure.com → **Microsoft Entra ID → App registrations → New registration** → name SentLedger; supported accounts: *any organizational directory and personal Microsoft accounts*; redirect (Web) `https://sentledger.com/oauth/microsoft/callback`.
2. **Certificates & secrets → New client secret** → copy the *Value* → `MICROSOFT_CLIENT_SECRET`; Application (client) ID → `MICROSOFT_CLIENT_ID`.
3. **API permissions → Add → Microsoft Graph → Delegated**: `Mail.Send`, `User.Read`, `offline_access`, `openid`, `email`.
4. Complete **Branding & properties → Publisher verification** before wide release (otherwise users see an "unverified" warning).

## Database

Migrations live in `supabase/migrations` and are already applied to project `tbygetlorehzixstgnht`. Apply new ones in order via the Supabase SQL editor or `supabase db push`. `supabase/tests/rls_and_ledger.sql` verifies tenant isolation and the event hash chain (it rolls back).
