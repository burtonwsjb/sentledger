# Extension integration (Chrome / Thunderbird) — architecture notes

Extensions are not built yet. The platform is ready for them; this is the contract.

## Authorization: device flow
1. Extension → `POST /v1/device/code {"client_name":"SentLedger for Chrome"}` → `{device_code, user_code, verification_uri, verification_uri_complete, interval, expires_in}`.
2. Extension opens `verification_uri_complete` (`/app/device?code=ABCD-EFGH`). The signed-in user picks a workspace and approves.
3. Extension polls `POST /v1/device/token {"device_code"}` every `interval` seconds until it gets `{access_token, organization_id}`. Errors: `authorization_pending`, `expired_token`, `access_denied`, `invalid_grant`.
4. The token is a normal scoped API key (`messages:write messages:read events:read templates:read contacts:read files:write`), listed and revocable under API & Webhooks.
Store it in `chrome.storage.local` / Thunderbird's encrypted storage, never in page-accessible storage.

## Sending from inside Gmail / Outlook web / Thunderbird
Two supported models, both producing the same message/event records:
- **Server send:** extension calls `POST /v1/messages` with `"source":"extension"` and `"send":true`. Sends via the workspace's connected inbox (`sender_identity_id` of a gmail/microsoft identity) or the platform sender.
- **Client send (draft sync):** extension calls `POST /v1/messages` with `"send":false` to create a draft, receives the tracked recipient tokens via `GET /v1/messages/:id`, injects tracking into the compose body, lets the mail client send, then calls `POST /v1/messages/:id/send`. (Phase 2: add `POST /v1/messages/:id/mark-sent` so client-sent mail is recorded without re-sending.)

## Reading state
- `GET /v1/messages?source=extension&limit=…` and `GET /v1/messages/:id` for per-message timelines.
- `GET /v1/events?from=…` as a polling feed, or subscribe a webhook.

## Shared model
Every client produces `messages` → `message_recipients` → hash-chained `events` with the same types (`message.sent`, `message.opened`, …). Provider-specific differences are expressed only through `send_via`/`provider` and which event types can occur.
