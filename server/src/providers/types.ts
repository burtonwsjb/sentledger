export type Address = { email: string; name?: string | null };

/** Provider-neutral outbound email. Every send path (web, API, extensions) produces one of these. */
export type OutboundEmail = {
  from: Address;
  replyTo?: string | null;
  to: Address[];
  cc?: Address[];
  bcc?: Address[];
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
};

export type SendResult = { providerMessageId: string | null };

export type ProviderCapabilities = {
  /** Provider reports delivered-to-mailbox events via webhook */
  deliveryEvents: boolean;
  /** Provider reports bounces / complaints via webhook */
  bounceEvents: boolean;
  /** Provider returns a message id we can correlate */
  messageId: boolean;
};

export interface EmailProvider {
  name: "resend" | "gmail" | "microsoft" | "dev";
  capabilities: ProviderCapabilities;
  send(email: OutboundEmail): Promise<SendResult>;
}

export class ProviderError extends Error {
  constructor(message: string, public retryable: boolean, public status?: number) {
    super(message);
  }
}

export const fmtAddr = (a: Address) => (a.name ? `"${a.name.replace(/["\\\r\n]/g, "")}" <${a.email}>` : a.email);
