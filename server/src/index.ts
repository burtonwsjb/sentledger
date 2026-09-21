import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "hono/bun";
import { bodyLimit } from "hono/body-limit";
import { env, features, isProd } from "./env";
import { log } from "./lib/log";
import { errorHandler, fail } from "./lib/errors";
import { authenticate, type AppEnv } from "./lib/auth";
import { ipLimit, actorLimit } from "./lib/ratelimit";
import { db } from "./lib/db";
import { openapi } from "./openapi";
import { tracking, page } from "./routes/tracking";
import { providerWebhooks } from "./routes/provider-webhooks";
import { messages } from "./routes/v1/messages";
import { account, workspace } from "./routes/v1/workspace";
import { content } from "./routes/v1/content";
import { developer, device } from "./routes/v1/developer";
import { plans, senders } from "./routes/v1/senders";
import { analytics, admin, publicForms } from "./routes/v1/misc";
import { marketing } from "./marketing/routes";
import { completeConnection } from "./providers/oauth";
import { handleStripeWebhook } from "./services/billing";
import { startWorker } from "./services/jobs";
import { releaseScheduled } from "./services/messages";
import { checkDomains, processDeletions, purgeRetention } from "./services/maintenance";
import "./services/webhooks"; // registers deliver_webhook job

const app = new Hono<AppEnv>();
const supabaseHost = new URL(env.SUPABASE_URL).host;

app.use("*", async (c, next) => {
  const id = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.set("requestId", id);
  c.header("X-Request-Id", id);
  const t = Date.now();
  await next();
  if (!c.req.path.startsWith("/assets/") && !c.req.path.startsWith("/t/o/")) {
    log.info("request", { id, method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - t });
  }
});

app.use("*", secureHeaders({
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
  referrerPolicy: "strict-origin-when-cross-origin",
  xFrameOptions: "DENY",
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net", "data:"],
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    connectSrc: ["'self'", `https://${supabaseHost}`, `wss://${supabaseHost}`],
    frameSrc: ["'self'", "blob:"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
  },
  permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
}));

app.onError(errorHandler);

// ---------- health ----------
app.get("/healthz", async (c) => {
  const { error } = await db.from("plans").select("id").limit(1);
  return c.json({ ok: !error, db: !error, features }, error ? 503 : 200);
});

// ---------- tracking + provider/billing webhooks (public, signature-verified) ----------
app.route("/", tracking);
app.route("/", providerWebhooks);
app.post("/webhooks/stripe", async (c) => {
  const sig = c.req.header("stripe-signature");
  if (!sig) fail("unauthorized", "Missing Stripe signature");
  return c.json(await handleStripeWebhook(await c.req.text(), sig!));
});

// ---------- OAuth callbacks ----------
app.get("/oauth/:provider/callback", async (c) => {
  const p = c.req.param("provider");
  if (p !== "gmail" && p !== "microsoft") return c.notFound();
  const err = c.req.query("error");
  if (err) return c.redirect(`/app/integrations?error=${encodeURIComponent(c.req.query("error_description") ?? err)}`);
  try {
    const r = await completeConnection(p, c.req.query("code") ?? "", c.req.query("state") ?? "");
    await db.from("audit_logs").insert({ org_id: r.orgId, actor_user_id: r.userId, action: "integration.connect", target_type: "connection", target_id: r.connectionId, data: { provider: p, account: r.email } });
    return c.redirect(`/app/integrations?connected=${encodeURIComponent(r.email)}`);
  } catch (e) {
    log.warn("oauth callback failed", { err: e, provider: p });
    return c.redirect(`/app/integrations?error=${encodeURIComponent((e as Error).message)}`);
  }
});

// ---------- API v1 ----------
const v1 = new Hono<AppEnv>();
v1.use("*", cors({
  origin: (o) => o, allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Org-Id"],
  allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"], exposeHeaders: ["X-Request-Id", "X-RateLimit-Remaining", "Idempotent-Replayed", "Retry-After"], maxAge: 600,
}));
v1.use("*", bodyLimit({ maxSize: 30 * 1024 * 1024, onError: () => fail("bad_request", "Request body too large") }));
v1.get("/openapi.json", (c) => c.json(openapi()));
v1.route("/public", publicForms);
v1.route("/", device);
v1.route("/", plans);            // public plan catalog
v1.route("/", account);          // /me, /orgs, /invitations/accept (session only)
v1.route("/admin", admin);        // platform admins only

const scoped = new Hono<AppEnv>();
scoped.use("*", ipLimit("v1-ip", 600, 60_000), authenticate, actorLimit("v1", 300, 60_000));
scoped.use("*", async (c, next) => {
  await next();
  const a = c.get("actor");
  if (a?.kind === "api_key") void db.rpc("increment_usage", { p_org: a.orgId, p_period: new Date().toISOString().slice(0, 7), p_sends: 0, p_api: 1 });
});
scoped.route("/", messages);
scoped.route("/", workspace);
scoped.route("/", content);
scoped.route("/", developer);
scoped.route("/", senders);
scoped.route("/", analytics);
v1.route("/", scoped);
v1.notFound((c) => c.json({ error: { code: "not_found", message: `No route ${c.req.method} ${c.req.path}` } }, 404));
app.route("/v1", v1);

// ---------- Web app (SPA) ----------
const webRoot = "./dist/web";
app.use("/assets/*", serveStatic({ root: webRoot, onFound: (_p, c) => { c.header("Cache-Control", "public, max-age=31536000, immutable"); } }));
app.get("/favicon.svg", serveStatic({ path: `${webRoot}/favicon.svg` }));
app.get("/og.png", serveStatic({ path: `${webRoot}/og.png` }));
app.get("/app", serveStatic({ path: `${webRoot}/app.html`, onFound: (_p, c) => { c.header("Cache-Control", "no-cache"); } }));
app.get("/app/*", serveStatic({ path: `${webRoot}/app.html`, onFound: (_p, c) => { c.header("Cache-Control", "no-cache"); } }));

// ---------- Marketing site ----------
app.route("/", marketing);
app.notFound(() => page("Page not found", `<h1>Page not found</h1><p>The page you're looking for doesn't exist.</p><a class="btn" href="/">Go to SentLedger</a>`, 404));

// ---------- Worker ----------
if (env.WORKER_ENABLED === "true") {
  startWorker([
    { name: "scheduled", everyMs: 15_000, fn: releaseScheduled },
    { name: "domains", everyMs: 10 * 60_000, fn: checkDomains },
    { name: "retention", everyMs: 6 * 3600_000, fn: purgeRetention },
    { name: "deletions", everyMs: 3600_000, fn: processDeletions },
  ]);
}

log.info("SentLedger starting", { port: env.PORT, env: env.NODE_ENV, features, publicUrl: env.PUBLIC_URL, prod: isProd });

export default { port: env.PORT, fetch: app.fetch, maxRequestBodySize: 30 * 1024 * 1024 };
export { app };
