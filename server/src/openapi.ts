import { env } from "./env";
import { API_SCOPES } from "./lib/auth";
import { WEBHOOK_EVENTS } from "./services/events";

const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema: unknown, description = "OK") => ({ description, content: { "application/json": { schema } } });
const list = (item: string) => ({
  type: "object",
  properties: { data: { type: "array", items: ref(item) }, has_more: { type: "boolean" }, next_cursor: { type: "string", nullable: true } },
});
const err = { description: "Error", content: { "application/json": { schema: ref("Error") } } };
const errors = { 400: err, 401: err, 403: err, 404: err, 409: err, 422: err, 429: err };
const idParam = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const pageParams = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
  { name: "cursor", in: "query", schema: { type: "string" }, description: "Opaque cursor from `next_cursor`" },
  { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
  { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
];
const idem = { name: "Idempotency-Key", in: "header", schema: { type: "string", maxLength: 200 }, description: "Retry-safe key. Same key + same body replays the original response; same key + different body returns 409." };
const scope = (s: string) => ({ "x-required-scope": s, description: `Requires the \`${s}\` scope.` });

export function openapi() {
  return {
    openapi: "3.1.0",
    info: {
      title: "SentLedger API",
      version: "1.0.0",
      description:
        "Send messages, track engagement, and retrieve tamper-evident evidence ledgers.\n\n" +
        "**Authentication:** `Authorization: Bearer sl_live_...` (API key, bound to one workspace).\n\n" +
        "**Errors:** `{ \"error\": { \"code\", \"message\", \"details\", \"request_id\" } }`.\n\n" +
        "**Pagination:** newest first; pass `next_cursor` as `cursor`.\n\n" +
        "**Tracking limitations:** opens depend on image loading and can be caused by privacy proxies or security scanners. Events include `is_proxy` and `uncertain` flags. Tracked events are not proof that a person read a message.",
    },
    servers: [{ url: `${env.PUBLIC_URL}/v1` }],
    security: [{ bearer: [] }],
    tags: [
      { name: "Messages" }, { name: "Events" }, { name: "Files" }, { name: "Templates" }, { name: "Contacts" },
      { name: "Suppressions" }, { name: "Webhooks" }, { name: "Usage" }, { name: "Extensions" },
    ],
    paths: {
      "/messages": {
        get: {
          tags: ["Messages"], summary: "List messages", ...scope("messages:read"),
          parameters: [...pageParams,
            { name: "status", in: "query", schema: { type: "string" }, description: "Comma-separated: draft,scheduled,queued,sending,sent,partially_failed,failed" },
            { name: "q", in: "query", schema: { type: "string" }, description: "Search subject and recipient" },
            { name: "recipient", in: "query", schema: { type: "string" } }, { name: "sender", in: "query", schema: { type: "string" } },
            { name: "tag", in: "query", schema: { type: "string" } }, { name: "source", in: "query", schema: { type: "string", enum: ["web", "api", "extension"] } },
            { name: "activity", in: "query", schema: { type: "string", enum: ["opened", "clicked", "file_viewed", "not_opened", "bounced"] } },
            { name: "correlation_id", in: "query", schema: { type: "string" } },
            { name: "metadata[key]", in: "query", schema: { type: "string" }, description: "Filter by a metadata value, e.g. `metadata[claim_id]=A-1001`" }],
          responses: { 200: json(list("Message")), ...errors },
        },
        post: {
          tags: ["Messages"], summary: "Create a message (draft, scheduled, or send now)", ...scope("messages:write"),
          parameters: [idem],
          requestBody: { required: true, content: { "application/json": { schema: ref("MessageInput") } } },
          responses: { 201: json(ref("Message"), "Created"), 402: err, 503: err, ...errors },
        },
      },
      "/messages/{id}": {
        get: { tags: ["Messages"], summary: "Retrieve a message with recipients and full event timeline", ...scope("messages:read"), parameters: [idParam], responses: { 200: json(ref("MessageDetail")), ...errors } },
        patch: { tags: ["Messages"], summary: "Edit a draft or scheduled message", ...scope("messages:write"), parameters: [idParam], requestBody: { content: { "application/json": { schema: ref("MessageInput") } } }, responses: { 200: json(ref("Message")), ...errors } },
        delete: { tags: ["Messages"], summary: "Delete (drafts) or soft-delete (sent) a message", ...scope("messages:write"), parameters: [idParam], responses: { 204: { description: "Deleted" }, ...errors } },
      },
      "/messages/{id}/send": { post: { tags: ["Messages"], summary: "Send or schedule a draft", ...scope("messages:write"), parameters: [idParam, idem], requestBody: { content: { "application/json": { schema: { type: "object", properties: { scheduled_at: { type: "string", format: "date-time" } } } } } }, responses: { 202: json(ref("Message"), "Queued"), 402: err, ...errors } } },
      "/messages/{id}/cancel": { post: { tags: ["Messages"], summary: "Cancel a scheduled send (returns it to draft)", ...scope("messages:write"), parameters: [idParam], responses: { 200: json(ref("Message")), ...errors } } },
      "/messages/{id}/revoke": { post: { tags: ["Messages"], summary: "Revoke secure-file access and tracked links", ...scope("messages:write"), parameters: [idParam], requestBody: { content: { "application/json": { schema: { type: "object", properties: { reason: { type: "string" } } } } } }, responses: { 200: json(ref("Message")), ...errors } } },
      "/messages/{id}/duplicate": { post: { tags: ["Messages"], summary: "Copy a message into a new draft", ...scope("messages:write"), parameters: [idParam], responses: { 201: json(ref("Message")), ...errors } } },
      "/messages/{id}/resend": { post: { tags: ["Messages"], summary: "Send a new copy to the same recipients", ...scope("messages:write"), parameters: [idParam], responses: { 201: json(ref("Message")), ...errors } } },
      "/messages/{id}/archive": { post: { tags: ["Messages"], summary: "Toggle archived state", ...scope("messages:write"), parameters: [idParam], responses: { 200: json(ref("Message")), ...errors } } },
      "/messages/{id}/events": { get: { tags: ["Events"], summary: "Evidence timeline for one message", ...scope("events:read"), parameters: [idParam], responses: { 200: json({ type: "object", properties: { data: { type: "array", items: ref("Event") } } }), ...errors } } },
      "/messages/{id}/evidence": {
        get: {
          tags: ["Messages"], summary: "Export the evidence ledger", ...scope("messages:read"),
          parameters: [idParam, { name: "format", in: "query", schema: { type: "string", enum: ["json", "csv", "pdf", "zip"], default: "json" }, description: "`zip` contains ledger.json, events.csv, report.pdf and a SHA-256 manifest." }],
          responses: { 200: { description: "Evidence export", content: { "application/json": { schema: ref("Ledger") }, "text/csv": {}, "application/pdf": {}, "application/zip": {} } }, ...errors },
        },
      },
      "/events": { get: { tags: ["Events"], summary: "Workspace event feed", ...scope("events:read"), parameters: [...pageParams, { name: "type", in: "query", schema: { type: "string" } }, { name: "message_id", in: "query", schema: { type: "string", format: "uuid" } }, { name: "include_duplicates", in: "query", schema: { type: "boolean" } }], responses: { 200: json(list("Event")), ...errors } } },
      "/files": {
        get: { tags: ["Files"], summary: "List secure files", ...scope("files:read"), parameters: pageParams, responses: { 200: json(list("File")), ...errors } },
        post: { tags: ["Files"], summary: "Upload a file (multipart/form-data, field `file`, max 25 MB)", ...scope("files:write"), requestBody: { content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } } } }, responses: { 201: json(ref("File")), 402: err, ...errors } },
      },
      "/files/{id}": {
        get: { tags: ["Files"], summary: "File details, links and access events", ...scope("files:read"), parameters: [idParam], responses: { 200: json(ref("File")), ...errors } },
        delete: { tags: ["Files"], summary: "Delete a file and revoke all links", ...scope("files:write"), parameters: [idParam], responses: { 204: { description: "Deleted" }, ...errors } },
      },
      "/files/{id}/links": { post: { tags: ["Files"], summary: "Create a signed secure-file link", ...scope("files:write"), parameters: [idParam], requestBody: { content: { "application/json": { schema: { type: "object", properties: { expires_at: { type: "string", format: "date-time" }, allow_download: { type: "boolean" } } } } } }, responses: { 201: json({ type: "object", properties: { id: { type: "string" }, url: { type: "string" }, expires_at: { type: "string", nullable: true } } }), ...errors } } },
      "/file-links/{id}/revoke": { post: { tags: ["Files"], summary: "Revoke a secure-file link", ...scope("files:write"), parameters: [idParam], responses: { 200: json({ type: "object" }), ...errors } } },
      "/templates": {
        get: { tags: ["Templates"], summary: "List templates", ...scope("templates:read"), parameters: pageParams, responses: { 200: json(list("Template")), ...errors } },
        post: { tags: ["Templates"], summary: "Create a template", ...scope("templates:write"), requestBody: { content: { "application/json": { schema: ref("TemplateInput") } } }, responses: { 201: json(ref("Template")), ...errors } },
      },
      "/templates/{id}": {
        get: { tags: ["Templates"], summary: "Get a template with version history", ...scope("templates:read"), parameters: [idParam], responses: { 200: json(ref("Template")), ...errors } },
        patch: { tags: ["Templates"], summary: "Update a template (content changes create a new version)", ...scope("templates:write"), parameters: [idParam], requestBody: { content: { "application/json": { schema: ref("TemplateInput") } } }, responses: { 200: json(ref("Template")), ...errors } },
        delete: { tags: ["Templates"], summary: "Delete a template", ...scope("templates:write"), parameters: [idParam], responses: { 204: { description: "Deleted" }, ...errors } },
      },
      "/contacts": {
        get: { tags: ["Contacts"], summary: "List contacts", ...scope("contacts:read"), parameters: [...pageParams, { name: "q", in: "query", schema: { type: "string" } }, { name: "tag", in: "query", schema: { type: "string" } }], responses: { 200: json(list("Contact")), ...errors } },
        post: { tags: ["Contacts"], summary: "Create a contact", ...scope("contacts:write"), requestBody: { content: { "application/json": { schema: ref("ContactInput") } } }, responses: { 201: json(ref("Contact")), ...errors } },
      },
      "/contacts/{id}": {
        get: { tags: ["Contacts"], summary: "Contact with communication history", ...scope("contacts:read"), parameters: [idParam], responses: { 200: json(ref("Contact")), ...errors } },
        patch: { tags: ["Contacts"], summary: "Update a contact", ...scope("contacts:write"), parameters: [idParam], requestBody: { content: { "application/json": { schema: ref("ContactInput") } } }, responses: { 200: json(ref("Contact")), ...errors } },
        delete: { tags: ["Contacts"], summary: "Delete a contact", ...scope("contacts:write"), parameters: [idParam], responses: { 204: { description: "Deleted" }, ...errors } },
      },
      "/contacts/import": { post: { tags: ["Contacts"], summary: "Import contacts from CSV (text/csv body or multipart `file`)", ...scope("contacts:write"), parameters: [{ name: "duplicates", in: "query", schema: { type: "string", enum: ["skip", "update"] } }], requestBody: { content: { "text/csv": { schema: { type: "string" } } } }, responses: { 200: json({ type: "object", properties: { created: { type: "integer" }, updated: { type: "integer" }, skipped_duplicates: { type: "integer" }, errors: { type: "array", items: { type: "object", properties: { row: { type: "integer" }, error: { type: "string" } } } } } }), ...errors } } },
      "/suppressions": {
        get: { tags: ["Suppressions"], summary: "List suppressed addresses", ...scope("contacts:read"), parameters: pageParams, responses: { 200: json(list("Suppression")), ...errors } },
        post: { tags: ["Suppressions"], summary: "Suppress an address", ...scope("contacts:write"), requestBody: { content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string" }, reason: { type: "string", enum: ["manual", "unsubscribe", "bounce", "complaint"] }, note: { type: "string" } } } } } }, responses: { 201: json(ref("Suppression")), ...errors } },
      },
      "/suppressions/{id}": { delete: { tags: ["Suppressions"], summary: "Remove a suppression", ...scope("contacts:write"), parameters: [idParam], responses: { 204: { description: "Removed" }, ...errors } } },
      "/webhooks": {
        get: { tags: ["Webhooks"], summary: "List webhook endpoints", ...scope("webhooks:manage"), responses: { 200: json({ type: "object", properties: { data: { type: "array", items: ref("WebhookEndpoint") } } }), ...errors } },
        post: { tags: ["Webhooks"], summary: "Create an endpoint (signing secret returned once)", ...scope("webhooks:manage"), requestBody: { content: { "application/json": { schema: ref("WebhookInput") } } }, responses: { 201: json(ref("WebhookEndpoint")), ...errors } },
      },
      "/webhooks/{id}": {
        patch: { tags: ["Webhooks"], summary: "Update an endpoint", ...scope("webhooks:manage"), parameters: [idParam], requestBody: { content: { "application/json": { schema: ref("WebhookInput") } } }, responses: { 200: json(ref("WebhookEndpoint")), ...errors } },
        delete: { tags: ["Webhooks"], summary: "Delete an endpoint", ...scope("webhooks:manage"), parameters: [idParam], responses: { 204: { description: "Deleted" }, ...errors } },
      },
      "/webhooks/{id}/test": { post: { tags: ["Webhooks"], summary: "Send a signed test event", ...scope("webhooks:manage"), parameters: [idParam], responses: { 202: json({ type: "object" }), ...errors } } },
      "/webhooks/{id}/rotate-secret": { post: { tags: ["Webhooks"], summary: "Rotate the signing secret", ...scope("webhooks:manage"), parameters: [idParam], responses: { 200: json({ type: "object", properties: { secret: { type: "string" } } }), ...errors } } },
      "/webhooks/{id}/deliveries": { get: { tags: ["Webhooks"], summary: "Delivery log", ...scope("webhooks:manage"), parameters: [idParam, ...pageParams], responses: { 200: json(list("WebhookDelivery")), ...errors } } },
      "/webhook-deliveries/{id}/replay": { post: { tags: ["Webhooks"], summary: "Replay a delivery", ...scope("webhooks:manage"), parameters: [idParam], responses: { 202: json({ type: "object" }), ...errors } } },
      "/usage": { get: { tags: ["Usage"], summary: "Plan, entitlements and current-period usage", ...scope("billing:read"), responses: { 200: json({ type: "object" }), ...errors } } },
      "/device/code": { post: { tags: ["Extensions"], security: [], summary: "Start device authorization (browser extensions)", requestBody: { content: { "application/json": { schema: { type: "object", required: ["client_name"], properties: { client_name: { type: "string" } } } } } }, responses: { 200: json({ type: "object", properties: { device_code: { type: "string" }, user_code: { type: "string" }, verification_uri: { type: "string" }, verification_uri_complete: { type: "string" }, expires_in: { type: "integer" }, interval: { type: "integer" } } }) } } },
      "/device/token": { post: { tags: ["Extensions"], security: [], summary: "Poll for the extension's API key", requestBody: { content: { "application/json": { schema: { type: "object", required: ["device_code"], properties: { device_code: { type: "string" } } } } } }, responses: { 200: json({ type: "object", properties: { access_token: { type: "string" }, token_type: { type: "string" }, scope: { type: "string" }, organization_id: { type: "string" } } }), 400: json({ type: "object", properties: { error: { type: "string", enum: ["authorization_pending", "expired_token", "access_denied", "invalid_grant"] } } }, "Pending or failed") } } },
    },
    webhooks: Object.fromEntries(WEBHOOK_EVENTS.map((e) => [e, {
      post: {
        summary: e, description: "Signed with `SentLedger-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, \"<t>.<raw body>\")>`. Reject if the timestamp is older than 5 minutes. Retries: 8 attempts over ~45 hours (1m, 5m, 30m, 2h, 6h, 12h, 24h).",
        requestBody: { content: { "application/json": { schema: ref("WebhookPayload") } } }, responses: { 200: { description: "Return any 2xx to acknowledge" } },
      },
    }])),
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: `API key (sl_live_...). Scopes: ${API_SCOPES.join(", ")}` } },
      schemas: {
        Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: {}, request_id: { type: "string" } } } } },
        Address: { oneOf: [{ type: "string", format: "email" }, { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" }, name: { type: "string" } } }] },
        MessageInput: {
          type: "object", required: ["to"],
          properties: {
            to: { type: "array", items: ref("Address"), maxItems: 50 }, cc: { type: "array", items: ref("Address") }, bcc: { type: "array", items: ref("Address") },
            subject: { type: "string" }, html: { type: "string", description: "Sanitized server-side. Supports {{variables}}." }, text: { type: "string", description: "Generated from HTML if omitted" },
            reply_to: { type: "string", format: "email" }, sender_identity_id: { type: "string", format: "uuid", description: "Omit to use the workspace default or the SentLedger platform sender" },
            template_id: { type: "string", format: "uuid" }, variables: { type: "object", additionalProperties: true },
            tags: { type: "array", items: { type: "string" } }, metadata: { type: "object", additionalProperties: true, description: "Your own identifiers (claim number, case ID, invoice...)" },
            correlation_id: { type: "string" },
            tracking: { type: "object", properties: { open: { type: "boolean" }, click: { type: "boolean" }, files: { type: "boolean" } } },
            delivery_mode: { type: "string", enum: ["individual", "group"], default: "individual", description: "individual: separately tracked copy per recipient. group: one email to everyone; engagement cannot be attributed to a person." },
            file_ids: { type: "array", items: { type: "string", format: "uuid" }, description: "Delivered as secure hosted-file links" },
            file_expires_at: { type: "string", format: "date-time" }, unsubscribe_link: { type: "boolean" },
            scheduled_at: { type: "string", format: "date-time" }, send: { type: "boolean", default: false, description: "false creates a draft" },
          },
        },
        Recipient: { type: "object", properties: { id: { type: "string" }, kind: { type: "string", enum: ["to", "cc", "bcc"] }, email: { type: "string" }, name: { type: "string", nullable: true }, status: { type: "string", enum: ["pending", "suppressed", "accepted", "delivered", "bounced", "complained", "failed"] }, open_count: { type: "integer" }, click_count: { type: "integer" }, file_view_count: { type: "integer" }, first_opened_at: { type: "string", nullable: true }, delivered_at: { type: "string", nullable: true } } },
        Message: { type: "object", properties: { id: { type: "string" }, status: { type: "string" }, subject: { type: "string" }, from_email: { type: "string" }, source: { type: "string" }, send_via: { type: "string" }, correlation_id: { type: "string" }, metadata: { type: "object" }, tags: { type: "array", items: { type: "string" } }, html_sha256: { type: "string", nullable: true }, text_sha256: { type: "string", nullable: true }, created_at: { type: "string" }, sent_at: { type: "string", nullable: true }, scheduled_at: { type: "string", nullable: true }, revoked_at: { type: "string", nullable: true }, message_recipients: { type: "array", items: ref("Recipient") } } },
        MessageDetail: { allOf: [ref("Message"), { type: "object", properties: { html: { type: "string" }, text: { type: "string" }, events: { type: "array", items: ref("Event") } } }] },
        Event: { type: "object", properties: { id: { type: "string" }, seq: { type: "integer" }, message_id: { type: "string" }, recipient_id: { type: "string", nullable: true }, type: { type: "string" }, occurred_at: { type: "string" }, source: { type: "string", enum: ["tracking", "provider", "system", "user", "api"] }, device: { type: "string", nullable: true }, is_proxy: { type: "boolean" }, uncertain: { type: "boolean" }, is_duplicate: { type: "boolean" }, data: { type: "object" }, prev_hash: { type: "string" }, hash: { type: "string" } } },
        Ledger: { type: "object", description: "sentledger.evidence.v1 — message, recipients, attachments, hash-chained events, integrity verification and disclaimer" },
        File: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, mime: { type: "string" }, size: { type: "integer" }, sha256: { type: "string" }, scan_status: { type: "string" }, created_at: { type: "string" } } },
        TemplateInput: { type: "object", required: ["name"], properties: { name: { type: "string" }, subject: { type: "string" }, html: { type: "string" }, text: { type: "string" }, tags: { type: "array", items: { type: "string" } }, folder_id: { type: "string", nullable: true }, visibility: { type: "string", enum: ["org", "private"] } } },
        Template: { allOf: [ref("TemplateInput"), { type: "object", properties: { id: { type: "string" }, version: { type: "integer" }, variables: { type: "array", items: { type: "string" } }, created_at: { type: "string" } } }] },
        ContactInput: { type: "object", required: ["primary_email"], properties: { name: { type: "string" }, company: { type: "string" }, primary_email: { type: "string" }, emails: { type: "array", items: { type: "string" } }, tags: { type: "array", items: { type: "string" } }, notes: { type: "string" }, consent: { type: "object" }, custom: { type: "object" } } },
        Contact: { allOf: [ref("ContactInput"), { type: "object", properties: { id: { type: "string" }, created_at: { type: "string" } } }] },
        Suppression: { type: "object", properties: { id: { type: "string" }, email: { type: "string" }, reason: { type: "string" }, note: { type: "string", nullable: true }, created_at: { type: "string" } } },
        WebhookInput: { type: "object", required: ["url", "events"], properties: { url: { type: "string", format: "uri" }, description: { type: "string" }, events: { type: "array", items: { type: "string", enum: [...WEBHOOK_EVENTS, "*"] } }, enabled: { type: "boolean" } } },
        WebhookEndpoint: { allOf: [ref("WebhookInput"), { type: "object", properties: { id: { type: "string" }, secret: { type: "string", description: "Only returned on create/rotate" }, created_at: { type: "string" } } }] },
        WebhookDelivery: { type: "object", properties: { id: { type: "string" }, event_id: { type: "string" }, event_type: { type: "string" }, status: { type: "string", enum: ["pending", "succeeded", "failed"] }, attempts: { type: "integer" }, last_status_code: { type: "integer", nullable: true }, next_attempt_at: { type: "string", nullable: true } } },
        WebhookPayload: { type: "object", properties: { id: { type: "string", description: "Stable event id (dedupe on this)" }, type: { type: "string" }, created_at: { type: "string" }, schema_version: { type: "string" }, organization_id: { type: "string" }, data: { type: "object", properties: { message_id: { type: "string" }, correlation_id: { type: "string" }, subject: { type: "string" }, metadata: { type: "object" }, recipient: { type: "object", nullable: true }, event: { type: "object" } } } } },
      },
    },
  };
}
