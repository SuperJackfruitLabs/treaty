/**
 * The outbox and inbox on SQLite, in the shape of a Durable Object's `ctx.storage`: `sql.exec`
 * is synchronous and `transactionSync` makes a group of writes atomic.
 *
 * - `enqueue` writes an event in the caller's transaction, beside the change it records.
 * - `drain` sends due events. Delivery is at least once: a crash after sending and before the
 *   row is cleared sends it again, which is why consumers use `handleOnce`.
 * - `handleOnce` runs a handler once per CloudEvents (source, id), in one transaction with the
 *   record that it ran, so a replay changes nothing and a failed handler can be retried.
 */
import {
  DEFAULT_BACKOFF,
  decodeEvent,
  encodeEvent,
  type Backoff,
  type Delivery,
  type OutboxEvent,
  type PendingEvent,
} from "./types.ts";

export interface SqliteLike {
  exec(
    query: string,
    ...bindings: unknown[]
  ): { toArray(): Record<string, unknown>[] };
}

export interface SqliteStorage {
  sql: SqliteLike;
  transactionSync<T>(fn: () => T): T;
}

export const SQLITE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS treaty_outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    id TEXT NOT NULL,
    subject TEXT NOT NULL,
    attributes TEXT NOT NULL,
    data BLOB,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    last_error TEXT,
    dead INTEGER NOT NULL DEFAULT 0,
    UNIQUE (source, id)
  )`,
  `CREATE INDEX IF NOT EXISTS treaty_outbox_due ON treaty_outbox (dead, next_attempt_at)`,
  `CREATE TABLE IF NOT EXISTS treaty_inbox (
    source TEXT NOT NULL,
    id TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    PRIMARY KEY (source, id)
  )`,
] as const;

export function migrate(sql: SqliteLike): void {
  for (const statement of SQLITE_SCHEMA) sql.exec(statement);
}

/** Call inside the transaction that makes the change the event records. Enqueuing the same event again does nothing. */
export function enqueue(
  sql: SqliteLike,
  event: OutboxEvent,
  subject: string,
  nowMs = Date.now(),
): void {
  const { attributes, data } = encodeEvent(event);
  sql.exec(
    `INSERT INTO treaty_outbox (source, id, subject, attributes, data, next_attempt_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (source, id) DO NOTHING`,
    event.attributes["source"],
    event.attributes["id"],
    subject,
    attributes,
    data,
    nowMs,
  );
}

export interface DrainOptions {
  nowMs?: number;
  limit?: number;
  /** How long a claimed event is hidden from another drain while it is being sent. */
  leaseMs?: number;
  backoff?: Backoff;
}

/** Sends due events through `send`; a throw from `send` schedules a retry. Returns how many were sent and failed. */
export async function drain(
  sql: SqliteLike,
  send: (pending: PendingEvent) => Promise<void>,
  options: DrainOptions = {},
): Promise<{ sent: number; failed: number }> {
  const now = options.nowMs ?? Date.now();
  const backoff = options.backoff ?? DEFAULT_BACKOFF;
  const claimed = sql
    .exec(
      `UPDATE treaty_outbox SET next_attempt_at = ? WHERE seq IN (
         SELECT seq FROM treaty_outbox WHERE dead = 0 AND next_attempt_at <= ? ORDER BY seq LIMIT ?
       ) RETURNING seq, subject, attributes, data, attempts`,
      now + (options.leaseMs ?? 60_000),
      now,
      options.limit ?? 100,
    )
    .toArray()
    .sort((a, b) => Number(a["seq"]) - Number(b["seq"]));
  let sent = 0;
  let failed = 0;
  for (const row of claimed) {
    const attempts = Number(row["attempts"]);
    try {
      await send({
        event: decodeEvent(
          String(row["attributes"]),
          (row["data"] as Uint8Array | ArrayBuffer | null) ?? null,
        ),
        subject: String(row["subject"]),
        attempts,
      });
      sql.exec(`DELETE FROM treaty_outbox WHERE seq = ?`, row["seq"]);
      sent++;
    } catch (error) {
      const next = attempts + 1;
      sql.exec(
        `UPDATE treaty_outbox SET attempts = ?, next_attempt_at = ?, last_error = ?, dead = ? WHERE seq = ?`,
        next,
        now + backoff.delayMs(next),
        String(error),
        next >= backoff.maxAttempts ? 1 : 0,
        row["seq"],
      );
      failed++;
    }
  }
  return { sent, failed };
}

/** Runs `handler` once per (source, id). A throw from `handler` rolls back, so the event can be handled on a later delivery. */
export function handleOnce(
  storage: SqliteStorage,
  event: OutboxEvent,
  handler: () => void,
  nowMs = Date.now(),
): Delivery {
  const { source, id } = event.attributes;
  if (!source || !id)
    throw new Error("an event needs its id and source attributes");
  return storage.transactionSync(() => {
    const fresh = storage.sql
      .exec(
        `INSERT INTO treaty_inbox (source, id, received_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING RETURNING id`,
        source,
        id,
        nowMs,
      )
      .toArray();
    if (fresh.length === 0) return "duplicate";
    handler();
    return "handled";
  });
}
