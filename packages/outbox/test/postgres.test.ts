import { PGlite } from "@electric-sql/pglite";
import { postgres, type OutboxEvent } from "../src/index.ts";
import type { CloudEvent } from "../../cloudevents/src/index.ts";
import { describe, expect, test } from "bun:test";
import { scenarios } from "./scenarios.ts";

// The outbox's event shape and the codec's are the same shape.
const fromCodec: OutboxEvent = { attributes: {} } satisfies CloudEvent;
void fromCodec;

scenarios({ describe, test, expect }, "postgres", async () => {
  const pg = new PGlite();
  await postgres.migrate(pg);
  await pg.query("CREATE TABLE orders (id TEXT PRIMARY KEY)");
  await pg.query("CREATE TABLE counter (n INTEGER NOT NULL)");
  await pg.query("INSERT INTO counter (n) VALUES (0)");
  const transaction = <T>(fn: (tx: postgres.PgLike) => Promise<T>) =>
    pg.transaction((tx) => fn(tx));
  return {
    async produce(order, event, fail) {
      await transaction(async (tx) => {
        await tx.query(
          "INSERT INTO orders (id) VALUES ($1) ON CONFLICT DO NOTHING",
          [order],
        );
        await postgres.enqueue(
          tx,
          event,
          "evt.ws_1.superpipeline.card.completed",
        );
        if (fail) throw new Error("the change failed");
      });
    },
    orders: async () =>
      (
        await pg.query<{ id: string }>(
          "SELECT id FROM orders WHERE id NOT LIKE '%again' ORDER BY id",
        )
      ).rows.map((r) => r.id),
    outboxRows: async () =>
      (
        await pg.query<{ id: string; attempts: number; dead: boolean }>(
          "SELECT id, attempts, dead FROM treaty_outbox ORDER BY seq",
        )
      ).rows,
    drain: (send, nowMs) => postgres.drain(pg, send, { nowMs }),
    consume: (event, fail) =>
      postgres.handleOnce(transaction, event, async (tx) => {
        await tx.query("UPDATE counter SET n = n + 1");
        if (fail) throw new Error("the handler failed");
      }),
    counted: async () =>
      (await pg.query<{ n: number }>("SELECT n FROM counter")).rows[0]!.n,
  };
});
