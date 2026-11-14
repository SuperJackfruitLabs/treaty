---
title: treaty-outbox
description: "@superjackfruitlabs/treaty-outbox: a transactional outbox and a deduplicating inbox for CloudEvents, on Durable Object SQLite and on Postgres."
---

[`@superjackfruitlabs/treaty-outbox`](https://www.npmjs.com/package/@superjackfruitlabs/treaty-outbox)
helps you make an event exactly once in effect on top of an at-least-once transport. Use it when a
service must send an event for a stored change, or when a receiver must not apply the same event
twice.

- **Outbox:** `enqueue()` writes the event inside the transaction that makes the change, so the two
  commit or fail together. `drain()` sends due events through your `send` function, at least once,
  and schedules a retry when it throws.
- **Inbox:** `handleOnce()` runs your handler once per CloudEvents `(source, id)`, in one
  transaction with the record that it ran. A replay returns `"duplicate"` and changes nothing; a
  throw rolls back, so a later delivery can try again.

Two implementations with the same functions: `sqlite`, shaped for a Durable Object's
`ctx.storage`, and `postgres`, for any client with `query(text, params)`.

```ts
import { sqlite } from "@superjackfruitlabs/treaty-outbox";

sqlite.migrate(ctx.storage.sql);
ctx.storage.transactionSync(() => {
  // ... write the change ...
  sqlite.enqueue(ctx.storage.sql, event, subject);
});
await sqlite.drain(ctx.storage.sql, async ({ event, subject }) => send(subject, event));

const outcome = sqlite.handleOnce(ctx.storage, incoming, () => {
  // ... apply it ...
});
```

The change and its outgoing event now commit together, while a repeated incoming event returns
`"duplicate"` instead of applying the handler again.

## What it exports

| Export | What |
| --- | --- |
| `sqlite`, `postgres` | Each has `migrate()`, `enqueue()`, `drain()` and `handleOnce()`, and its schema (`SQLITE_SCHEMA`, `POSTGRES_SCHEMA`). |
| `OutboxEvent` | An event as stored: the same shape as `CloudEvent` from `treaty-cloudevents`, so either passes for the other. It needs `id` and `source`. |
| `PendingEvent` | What `drain()` hands to `send`: the event, its subject and how many attempts it has had. |
| `Delivery` | What `handleOnce()` did: `"handled"` or `"duplicate"`. |
| `Backoff`, `DEFAULT_BACKOFF` | When to retry a failed send. The default waits 1 minute after the first failure, doubling to at most 1 hour, and parks an event as dead after 12 attempts. |
| `DrainOptions` | `nowMs`, `limit` (default 100 events), `leaseMs` (default 60 s: how long a claimed event is hidden from another drain) and `backoff`. |

While an event is still pending, enqueuing the same `(source, id)` again does nothing. After a
successful drain deletes that row, the at-least-once boundary still applies, so receivers use
`handleOnce()` to make any later repeat harmless.
