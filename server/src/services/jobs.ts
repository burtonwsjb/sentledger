import { db, must } from "../lib/db";
import { log } from "../lib/log";

export type JobType = "send_message" | "deliver_webhook" | "check_domain" | "purge_retention" | "notify_owner";

export async function enqueue(type: JobType, payload: Record<string, unknown>, opts: { runAt?: Date; maxAttempts?: number } = {}) {
  const row = { type, payload, run_at: (opts.runAt ?? new Date()).toISOString(), max_attempts: opts.maxAttempts ?? 5 };
  return must(await db.from("jobs").insert(row).select("id").single(), "enqueue") as { id: string };
}

type Handler = (payload: any, job: { id: string; attempts: number; max_attempts: number }) => Promise<void>;
const handlers = new Map<JobType, Handler>();
export const registerJob = (type: JobType, h: Handler) => handlers.set(type, h);

/** Retryable error: job is rescheduled with backoff until max_attempts, then marked dead. */
export class RetryLater extends Error {
  constructor(message: string, public delayMs?: number) {
    super(message);
  }
}

const backoff = (attempt: number) => Math.min(60 * 60_000, 15_000 * 2 ** (attempt - 1)); // 15s, 30s, 1m, 2m ... max 1h

async function runOne(job: any) {
  const h = handlers.get(job.type);
  if (!h) {
    await db.from("jobs").update({ status: "dead", last_error: "no handler" }).eq("id", job.id);
    return;
  }
  const started = Date.now();
  try {
    await h(job.payload, job);
    await db.from("jobs").update({ status: "done", last_error: null }).eq("id", job.id);
    log.info("job done", { job: job.id, type: job.type, ms: Date.now() - started });
  } catch (e) {
    const err = e as Error;
    const retry = e instanceof RetryLater && job.attempts < job.max_attempts;
    const runAt = new Date(Date.now() + ((e as RetryLater).delayMs ?? backoff(job.attempts)));
    await db.from("jobs").update({
      status: retry ? "queued" : "dead", run_at: retry ? runAt.toISOString() : job.run_at, last_error: err.message.slice(0, 1000), locked_at: null,
    }).eq("id", job.id);
    (retry ? log.warn : log.error)("job failed", { job: job.id, type: job.type, attempt: job.attempts, retry, err });
  }
}

let running = false;
export function startWorker(periodic: { everyMs: number; fn: () => Promise<void>; name: string }[]) {
  if (running) return;
  running = true;
  log.info("worker started");
  const loop = async () => {
    while (running) {
      try {
        const { data, error } = await db.rpc("claim_jobs", { p_limit: 10 });
        if (error) throw new Error(error.message);
        if (data?.length) await Promise.all(data.map(runOne));
        else await Bun.sleep(1500);
      } catch (e) {
        log.error("worker loop error", { err: e });
        await Bun.sleep(5000);
      }
    }
  };
  void loop();
  for (const p of periodic) {
    setInterval(() => p.fn().catch((err) => log.error(`periodic ${p.name} failed`, { err })), p.everyMs);
  }
}
export const stopWorker = () => { running = false; };
