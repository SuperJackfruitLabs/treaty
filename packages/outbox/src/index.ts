/**
 * A transactional outbox and a deduplicating inbox for CloudEvents (treaty plan step 5).
 *
 * A producer writes an event in the same transaction as the change it records, and a drain sends
 * it at least once. A consumer handles each CloudEvents (source, id) once, in one transaction
 * with the record that it did, so replaying an event changes nothing.
 *
 * `sqlite` is shaped for a Durable Object's `ctx.storage`; `postgres` for any client with
 * `query(text, params)`.
 */
export * as sqlite from "./sqlite.ts";
export * as postgres from "./postgres.ts";
export {
  DEFAULT_BACKOFF,
  type Backoff,
  type Delivery,
  type OutboxEvent,
  type PendingEvent,
} from "./types.ts";
export type { DrainOptions } from "./sqlite.ts";
