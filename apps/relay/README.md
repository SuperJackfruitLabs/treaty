# relay

Workers and Durable Objects cannot hold a NATS connection. The relay stands between them and
NATS JetStream (treaty plan step 6):

- **In:** `POST /v1/events/<subject>` with a CloudEvent in HTTP binary mode and
  `Authorization: Bearer <producer token>`. The relay checks that the producer may publish to
  the subject, that the subject is a suite subject and that the event's `type` names the same
  product, entity and verb. It publishes the event to JetStream in NATS binary mode with
  `Nats-Msg-Id` set to the event id, so a resend inside the duplicate window is stored once.
  It answers `202 {"id", "duplicate"}`.
- **Out:** each subscriber has a durable JetStream consumer on its filter. The relay POSTs every
  event to the subscriber's URL as an HTTP binary-mode CloudEvent, signed with
  `x-treaty-signature: t=<unix>,v1=<HMAC-SHA256>` over `<t>.<id>.<body>`. A Worker checks it
  with `verifyDelivery` from `@superjackfruitlabs/treaty-cloudevents`.
  - 2xx: delivered.
  - 408, 429, 5xx or a network failure: redelivered after 1 s, 2 s, 4 s … up to 5 minutes,
    until the subscriber's `maxDeliver`.
  - Any other 4xx, or a message that is not a valid event: dropped and logged.
- **Streams:** `WORK` holds `evt.>`, `AUDIT` holds `audit.>`, so a slow audit consumer never
  holds up work and purging work never touches audit.

Delivery is at least once: a subscriber handles each event once with `handleOnce` from
`@superjackfruitlabs/treaty-outbox`.

## Configuration

| Variable                                | What                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NATS_URL`                              | default `nats://127.0.0.1:4222`                                                                                                                  |
| `PORT`                                  | default `8080`. `GET /healthz` answers on it too.                                                                                                |
| `TREATY_RELAY_PRODUCERS`                | JSON list of `{ name, tokenSha256, subjects }`: the SHA-256 of each producer's token and the subject patterns (NATS wildcards) it may publish to |
| `TREATY_RELAY_SUBSCRIBERS`              | JSON list of `{ name, url, secret, filter, maxDeliver? }`. `url` must be https (http only for localhost). `maxDeliver` defaults to 10.           |
| `TREATY_RELAY_WORK_MAX_AGE_HOURS`       | default 168                                                                                                                                      |
| `TREATY_RELAY_AUDIT_MAX_AGE_DAYS`       | default 365                                                                                                                                      |
| `TREATY_RELAY_DUPLICATE_WINDOW_MINUTES` | default 60                                                                                                                                       |

## Not decided yet

- **How senders authenticate, hosted and self-hosted.** A per-producer bearer token works in
  both and is what this does. Hosted could verify accounts tokens instead.
- **Retention.** The defaults above are placeholders.

## Running and testing

`bun apps/relay/src/main.ts`. The NATS tests (`test/nats.test.ts`) need a JetStream server:
start `nats-server -js` and set `NATS_URL`. CI downloads a pinned `nats-server`, checks its
checksum and runs them with `TREATY_REQUIRE_NATS=1`, so they cannot be skipped there.
