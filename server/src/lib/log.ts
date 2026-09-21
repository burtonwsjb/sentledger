// Structured JSON logging + optional Sentry-compatible error reporting.
import { env } from "../env";

type Fields = Record<string, unknown>;

function emit(level: string, msg: string, fields?: Fields) {
  const line = { ts: new Date().toISOString(), level, msg, ...fields };
  const out = JSON.stringify(line, (_k, v) => (v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v));
  if (level === "error" || level === "fatal") console.error(out);
  else console.log(out);
}

export const log = {
  debug: (msg: string, f?: Fields) => env.NODE_ENV !== "production" && emit("debug", msg, f),
  info: (msg: string, f?: Fields) => emit("info", msg, f),
  warn: (msg: string, f?: Fields) => emit("warn", msg, f),
  error: (msg: string, f?: Fields) => {
    emit("error", msg, f);
    void reportError(msg, f);
  },
};

// Minimal Sentry envelope client (no SDK dependency). Enabled when SENTRY_DSN is set.
let dsn: { url: string; key: string } | null = null;
if (env.SENTRY_DSN) {
  try {
    const u = new URL(env.SENTRY_DSN);
    const projectId = u.pathname.replace("/", "");
    dsn = { url: `${u.protocol}//${u.host}/api/${projectId}/envelope/`, key: u.username };
  } catch {
    dsn = null;
  }
}

async function reportError(msg: string, f?: Fields) {
  if (!dsn) return;
  try {
    const err = f?.err instanceof Error ? f.err : undefined;
    const event = {
      event_id: crypto.randomUUID().replaceAll("-", ""),
      timestamp: Date.now() / 1000,
      platform: "javascript",
      level: "error",
      environment: env.NODE_ENV,
      message: msg,
      exception: err ? { values: [{ type: err.name, value: err.message, stacktrace: { frames: [] } }] } : undefined,
      extra: { ...f, err: err?.stack },
    };
    const body = `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`;
    await fetch(dsn.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.key}` },
      body,
    });
  } catch {
    /* never throw from the reporter */
  }
}
