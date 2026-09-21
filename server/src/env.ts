import { z } from "zod";

const optional = z.string().trim().min(1).optional().or(z.literal("").transform(() => undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  PUBLIC_URL: z.string().url().default("http://localhost:8080"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  // 32-byte key, base64. Encrypts OAuth tokens and webhook secrets at rest.
  ENCRYPTION_KEY: z.string().min(40),
  // HMAC secrets
  TRACKING_SECRET: z.string().min(24),
  IP_HASH_SALT: z.string().min(16),
  // Email sending (Resend)
  RESEND_API_KEY: optional,
  RESEND_WEBHOOK_SECRET: optional,
  PLATFORM_FROM_EMAIL: z.string().default("notifications@sentledger.com"),
  PLATFORM_SEND_DOMAIN: z.string().default("sentledger.com"),
  // Stripe
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  TRIAL_DAYS: z.coerce.number().default(14),
  // OAuth providers
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  MICROSOFT_CLIENT_ID: optional,
  MICROSOFT_CLIENT_SECRET: optional,
  MICROSOFT_TENANT: z.string().default("common"),
  // Operations
  PLATFORM_ADMIN_EMAILS: z.string().default(""),
  SENTRY_DSN: optional,
  WORKER_ENABLED: z.enum(["true", "false"]).default("true"),
  MALWARE_SCAN_URL: optional,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(JSON.stringify({ level: "fatal", msg: "invalid environment", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const features = {
  email: Boolean(env.RESEND_API_KEY),
  stripe: Boolean(env.STRIPE_SECRET_KEY),
  gmail: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  microsoft: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
};
export const platformAdmins = new Set(
  env.PLATFORM_ADMIN_EMAILS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);
