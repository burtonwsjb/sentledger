import { env, isProd } from "../env";
import { log } from "../lib/log";
import { resend } from "./resend";
import { connectedProvider } from "./oauth";
import { type EmailProvider, ProviderError } from "./types";

/** Development-only provider: logs instead of sending. Never used in production. */
const devProvider: EmailProvider = {
  name: "dev",
  capabilities: { deliveryEvents: false, bounceEvents: false, messageId: true },
  async send(m) {
    log.info("dev email (not sent)", { to: m.to.map((a) => a.email), subject: m.subject });
    return { providerMessageId: `dev_${crypto.randomUUID()}` };
  },
};

export function managedProvider(): EmailProvider {
  if (env.RESEND_API_KEY) return resend;
  if (!isProd) return devProvider;
  throw new ProviderError("Email sending is not configured on this server", false);
}

export function providerFor(sendVia: string, connectionId?: string | null): EmailProvider {
  if (sendVia === "gmail" || sendVia === "microsoft") {
    if (!connectionId) throw new ProviderError("No connected account selected", false);
    return connectedProvider(connectionId, sendVia);
  }
  return managedProvider();
}

export * from "./types";
