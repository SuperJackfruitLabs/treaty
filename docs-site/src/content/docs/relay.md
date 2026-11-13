---
title: The relay
description: "The relay carries events from Cloudflare Workers into NATS JetStream and delivers them back to subscribers over signed HTTP, at least once."
---

Cloudflare Workers and Durable Objects cannot hold a NATS connection. The relay stands between
them and NATS JetStream: a producer POSTs an event to it over HTTPS, it stores the event in
JetStream, and it POSTs the event on to every subscriber whose filter matches, signed. It is a
Bun service in `apps/relay`, and the only part of Treaty that runs.

It keeps two JetStream streams: `WORK` holds `evt.>`, and `AUDIT` holds `audit.>`, so a slow audit
consumer never holds up work and purging work never touches audit. Subscribers read `WORK`.

```
producer ──POST /v1/events/<subject>──▶ relay ──▶ JetStream (WORK: evt.>, AUDIT: audit.>)
                                          │
                                          └──signed POST──▶ each subscriber's URL
```

## Publishing an event

`POST /v1/events/<subject>` with the event in HTTP binary mode (see [the envelope](/envelope/))
and `Authorization: Bearer <producer token>`. The relay:

1. knows the producer by its token: it stores only the token's SHA-256;
2. checks the subject is a suite subject, and one the producer may publish to (its patterns use
   NATS wildcards, for example `evt.*.superpipeline.>`);
3. checks the event's `type` names the same product, entity and verb as the subject, so a
   producer cannot file an event under another's name;
4. publishes it to JetStream in NATS binary mode with `Nats-Msg-Id` set to the event's `id`, so a
   resend inside the duplicate window is stored once.

| Status | `error` | When |
| --- | --- | --- |
| 202 | | Stored. The body is `{"id", "duplicate"}`; `duplicate` is true for a resend already stored. |
| 400 | `bad_subject` | The path is not a suite subject. |
| 400 | `bad_event` | The request is not a valid binary-mode CloudEvent. |
| 401 | `unauthenticated` | No token, or one the relay does not know. |
| 403 | `subject_not_allowed` | The producer may not publish to this subject. |
| 404 | `not_found` | The path is not under `/v1/events/`. |
| 405 | `method_not_allowed` | Not a POST. |
| 413 | `too_large` | The body is over 1 MiB. |
| 422 | `bad_type` | The `type` is not a suite event type. |
| 422 | `type_does_not_match_subject` | The `type` names another product, entity or verb. |
| 503 | `publish_failed` | JetStream did not take it. Send it again. |

A producer keeps the event in an [outbox](/packages/outbox/) until it gets a 202, and sends the
same `id` on every retry.

## Subscribing

A subscriber is a URL that accepts signed POSTs. The relay's operator adds it to the relay's
configuration, `TREATY_RELAY_SUBSCRIBERS`, with:

| Field | What |
| --- | --- |
| `name` | Letters, digits, `_` or `-`. The durable JetStream consumer is `relay-<name>`. |
| `url` | Where events are POSTed. Must be https; plain http only for `localhost`, `127.0.0.1` or a single-label host on the relay's own network. |
| `secret` | The shared secret deliveries are signed with. |
| `filter` | A subject filter, for example `evt.*.superpipeline.>` for every SuperPipeline event, or `evt.*.superpipeline.gate.pending` for one. |
| `maxDeliver` | How many times one event is tried. Default `10`. |

Each subscriber gets its own durable consumer on the `WORK` stream, starting from everything the
stream holds, so a subscriber added later still receives what is retained.

## Delivery and retries

Every event is POSTed to the subscriber's URL as an HTTP binary-mode CloudEvent with the
`x-treaty-signature` header. The subscriber's status decides what happens next:

| Answer | What the relay does |
| --- | --- |
| 2xx | Delivered. Acknowledged. |
| 408, 429, 5xx, or a network failure | Redelivered after a backoff: 1 s, 2 s, 4 s and so on, doubling up to 5 minutes, until `maxDeliver` tries. |
| Any other 4xx | Dropped and logged: retrying cannot help. |
| (a stored message that is not a valid event) | Dropped and logged. |

An unacknowledged delivery is retried after 30 seconds. After `maxDeliver` tries JetStream stops
delivering that event to that subscriber; the relay keeps no separate dead-letter queue.

**Answer 2xx for an event you will never act on.** SuperDispatch answers `200
{"status":"ignored"}` for an event about a board it does not schedule, so the relay does not retry
it.

**Delivery is at least once.** The same event can arrive more than once. Handle each `(source,
id)` once, with `handleOnce()` from `@superjackfruitlabs/treaty-outbox`, in the same transaction as
what the event changes.

## Verifying a delivery

The header is:

```
x-treaty-signature: t=<unix seconds>,v1=<hex HMAC-SHA256>
```

over `<t>.<event id>.<body>`, with the subscriber's secret as the key. Binding the id stops a
captured body from being replayed under another id, and the timestamp bounds how long a captured
request is accepted. Check it with `verifyDelivery()` before believing anything in the request:

```ts
import {
  SIGNATURE_HEADER,
  fromBinary,
  verifyDelivery,
} from "@superjackfruitlabs/treaty-cloudevents";

export async function onDelivery(request: Request, secret: string): Promise<Response> {
  const body = new Uint8Array(await request.arrayBuffer());
  const headers = Object.fromEntries(request.headers);
  let event;
  try {
    event = fromBinary({ headers, body }, "http");
  } catch {
    return new Response("not a CloudEvent", { status: 400 });
  }
  try {
    await verifyDelivery(secret, request.headers.get(SIGNATURE_HEADER), event.attributes.id!, body);
  } catch {
    return new Response("bad signature", { status: 401 });
  }
  // ... handle the event once, then answer 2xx
  return new Response(null, { status: 204 });
}
```

`verifyDelivery()` throws on a missing or malformed header, a timestamp more than 300 seconds from
now (`toleranceSeconds` changes it), or a signature that does not match; it compares in constant
time. It uses Web Crypto only, so it runs in Workers, Bun and Node. `signDelivery()` is the other
half, which the relay uses.

A 400 or 401 is a 4xx the relay does not retry, which is what you want for a request that is not
from the relay.

## Settings

| Variable | Default | What |
| --- | --- | --- |
| `NATS_URL` | `nats://127.0.0.1:4222` | The JetStream server. |
| `PORT` | `8080` | Where the relay listens. `GET /healthz` answers on it too. |
| `TREATY_RELAY_PRODUCERS` | none | JSON list of `{ name, tokenSha256, subjects }`. |
| `TREATY_RELAY_SUBSCRIBERS` | none | JSON list of `{ name, url, secret, filter, maxDeliver? }`. |
| `TREATY_RELAY_WORK_MAX_AGE_HOURS` | `168` | How long `WORK` keeps an event. |
| `TREATY_RELAY_AUDIT_MAX_AGE_DAYS` | `365` | How long `AUDIT` keeps an event. |
| `TREATY_RELAY_DUPLICATE_WINDOW_MINUTES` | `60` | How long a resent `id` is recognised. |

## Not decided yet

- **How producers authenticate.** A bearer token per producer is what the relay does today.
  Verifying the organization plane's tokens instead is open.
- **Retention.** The defaults above are placeholders.

## Where it runs

The relay runs in production and on staging. A merge to main deploys staging; a `v*` tag deploys
production, and a release whose smoke check fails puts the previous one back.
