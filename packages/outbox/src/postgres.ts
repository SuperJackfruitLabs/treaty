/**
 * The outbox and inbox on Postgres, through the smallest async client shape: `query(text, params)`
 * returning `{ rows }`, which pg, PGlite and a thin wrapper over postgres.js all provide.
 *
 * - `enqueue` takes a client that is already inside the caller's transaction.
 * - `drain` claims due rows with `FOR UPDATE SKIP LOCKED` and a lease, so several drains can run
 *   at once without sending the same row twice while it is leased, and sends outside any
 *   transaction. Delivery is at least once.
 * - `handleOnce` takes the caller's way of running a transaction, and records the event in the
 *   same transaction as the handler's writes.
 */
import {
  DEFAULT_BACKOFF,
  decodeEvent,
  encodeEvent,
  type Delivery,
  type OutboxEvent,
  type PendingEvent,
} from "./types.ts";
import type { DrainOptions } from "./sqlite.ts";

export interface PgLike {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

export const POSTGRES_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS treaty_outbox (
    seq BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    id TEXT NOT NULL,
    subject TEXT NOT NULL,
    attributes JSONB NOT NULL,
    data BYTEA,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at BIGINT NOT NULL,
    last_error TEXT,
    dead BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (source, id)
  )`,
  `CREATE INDEX IF NOT EXISTS treaty_outbox_due ON treaty_outbox (dead, next_attempt_at)`,
  `CREATE TABLE IF NOT EXISTS treaty_inbox (
    source TEXT NOT NULL,
    id TEXT NOT NULL,
    received_at BIGINT NOT NULL,
    PRIMARY KEY (source, id)
  )`,
] as const;

export async function migrate(db: PgLike): Promise<void> {
  for (const statement of POSTGRES_SCHEMA) await db.query(statement);
}

/** Call with the client of the transaction that makes the change the event records. Enqueuing the same event again does nothing. */
export async function enqueue(
  tx: PgLike,
  event: OutboxEvent,
  subject: string,
  nowMs = Date.now(),
): Promise<void> {
  const { attributes, data } = encodeEvent(event);
  await tx.query(
    `INSERT INTO treaty_outbox (source, id, subject, attributes, data, next_attempt_at) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source, id) DO NOTHING`,
    [
      event.attributes["source"],
      event.attributes["id"],
      subject,
      attributes,
      data,
      nowMs,
    ],
  );
}

export async function drain(
  db: PgLike,
  send: (pending: PendingEvent) => Promise<void>,
  options: DrainOptions = {},
): Promise<{ sent: number; failed: number }> {
  const now = options.nowMs ?? Date.now();
  const backoff = options.backoff ?? DEFAULT_BACKOFF;
  const { rows } = await db.query(
    `UPDATE treaty_outbox SET next_attempt_at = $1 WHERE seq IN (
       SELECT seq FROM treaty_outbox WHERE NOT dead AND next_attempt_at <= $2 ORDER BY seq LIMIT $3 FOR UPDATE SKIP LOCKED
     ) RETURNING seq, subject, attributes, data, attempts`,
    [now + (options.leaseMs ?? 60_000), now, options.limit ?? 100],
  );
  rows.sort((a, b) => Number(a["seq"]) - Number(b["seq"]));
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const attempts = Number(row["attempts"]);
    const attributes =
      typeof row["attributes"] === "string"
        ? row["attributes"]
        : JSON.stringify(row["attributes"]);
    try {
      await send({
        event: decodeEvent(
          attributes,
          (row["data"] as Uint8Array | null) ?? null,
        ),
        subject: String(row["subject"]),
        attempts,
      });
      await db.query(`DELETE FROM treaty_outbox WHERE seq = $1`, [row["seq"]]);
      sent++;
    } catch (error) {
      const next = attempts + 1;
      await db.query(
        `UPDATE treaty_outbox SET attempts = $1, next_attempt_at = $2, last_error = $3, dead = $4 WHERE seq = $5`,
        [
          next,
          now + backoff.delayMs(next),
          String(error),
          next >= backoff.maxAttempts,
          row["seq"],
        ],
      );
      failed++;
    }
  }
  return { sent, failed };
}

/** Runs `handler` once per (source, id), in one transaction with the record that it ran. */
export async function handleOnce(
  transaction: <T>(fn: (tx: PgLike) => Promise<T>) => Promise<T>,
  event: OutboxEvent,
  handler: (tx: PgLike) => Promise<void>,
  nowMs = Date.now(),
): Promise<Delivery> {
  const { source, id } = event.attributes;
  if (!source || !id)
    throw new Error("an event needs its id and source attributes");
  return transaction(async (tx) => {
    const { rows } = await tx.query(
      `INSERT INTO treaty_inbox (source, id, received_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`,
      [source, id, nowMs],
    );
    if (rows.length === 0) return "duplicate";
    await handler(tx);
    return "handled";
  });
}
