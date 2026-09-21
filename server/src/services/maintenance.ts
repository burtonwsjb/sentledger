import { db, must } from "../lib/db";
import { log } from "../lib/log";
import { features } from "../env";
import { getDomain } from "../providers/resend";
import { stripe } from "./billing";

/**
 * Retention: messages (and their ledger events) older than the workspace's retention window are permanently removed.
 * Soft-deleted files are purged from storage after 30 days.
 */
export async function purgeRetention() {
  const orgs = must(await db.from("organizations").select("id, retention_days").is("deleted_at", null), "orgs") as any[];
  let purged = 0;
  for (const o of orgs) {
    const cutoff = new Date(Date.now() - o.retention_days * 86_400_000).toISOString();
    const old = must(await db.from("messages").select("id").eq("org_id", o.id).lt("created_at", cutoff).limit(500), "old") as any[];
    if (old.length) {
      await db.from("messages").delete().in("id", old.map((m) => m.id));
      purged += old.length;
      await db.from("audit_logs").insert({ org_id: o.id, action: "retention.purge", data: { messages: old.length, cutoff } });
    }
  }
  const fileCutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const files = must(await db.from("files").select("id, storage_path").not("deleted_at", "is", null).lt("deleted_at", fileCutoff).not("storage_path", "like", "purged/%").limit(500), "files") as any[];
  if (files.length) {
    await db.storage.from("secure-files").remove(files.map((f) => f.storage_path));
    // keep the row (sha256, name, size stay in historical ledgers); mark storage as purged
    for (const f of files) await db.from("files").update({ storage_path: `purged/${f.id}` }).eq("id", f.id);
  }
  await db.from("idempotency_keys").delete().lt("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  await db.from("jobs").delete().eq("status", "done").lt("updated_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  await db.from("device_authorizations").delete().lt("expires_at", new Date(Date.now() - 86_400_000).toISOString());
  if (purged) log.info("retention purge", { purged });
}

/** Completes workspace deletion requests after their 30-day grace period. */
export async function processDeletions() {
  const due = must(await db.from("deletion_requests").select("id, org_id").eq("status", "pending").lte("scheduled_for", new Date().toISOString()), "due") as any[];
  for (const d of due) {
    try {
      const sub = (await db.from("subscriptions").select("stripe_subscription_id").eq("org_id", d.org_id).maybeSingle()).data;
      if (sub?.stripe_subscription_id && features.stripe) await stripe().subscriptions.cancel(sub.stripe_subscription_id).catch(() => undefined);
      const files = (await db.from("files").select("storage_path").eq("org_id", d.org_id)).data ?? [];
      for (let i = 0; i < files.length; i += 500) await db.storage.from("secure-files").remove(files.slice(i, i + 500).map((f: any) => f.storage_path));
      await db.from("audit_logs").insert({ org_id: d.org_id, action: "org.deleted", data: { deletion_request: d.id } });
      await db.from("deletion_requests").update({ status: "completed", processed_at: new Date().toISOString() }).eq("id", d.id);
      await db.from("organizations").delete().eq("id", d.org_id);
      log.info("organization deleted", { org: d.org_id });
    } catch (e) {
      log.error("org deletion failed", { err: e, org: d.org_id });
    }
  }
}

/** Re-checks pending sending domains so customers don't have to keep clicking "verify". */
export async function checkDomains() {
  if (!features.email) return;
  const pending = must(await db.from("sender_domains").select("id, provider_domain_id, status").eq("status", "pending").not("provider_domain_id", "is", null).limit(50), "domains") as any[];
  for (const d of pending) {
    try {
      const s = await getDomain(d.provider_domain_id);
      if (s.status === "verified") await db.from("sender_domains").update({ status: "verified", verified_at: new Date().toISOString(), last_checked_at: new Date().toISOString() }).eq("id", d.id);
      else await db.from("sender_domains").update({ last_checked_at: new Date().toISOString() }).eq("id", d.id);
    } catch (e) {
      log.warn("domain check failed", { err: e, domain: d.id });
    }
  }
}
