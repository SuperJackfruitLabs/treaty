import { Database } from "bun:sqlite";
import { sqlite } from "../src/index.ts";
import { describe, expect, test } from "bun:test";
import { scenarios } from "./scenarios.ts";

/** bun:sqlite, shaped like a Durable Object's ctx.storage. */
function storage() {
  const db = new Database(":memory:");
  return {
    db,
    sql: {
      exec: (query: string, ...bindings: unknown[]) => {
        const rows = db.prepare(query).all(...(bindings as never[])) as Record<
          string,
          unknown
        >[];
        return { toArray: () => rows };
      },
    },
    transactionSync: <T>(fn: () => T): T => db.transaction(fn)(),
  };
}

scenarios({ describe, test, expect }, "sqlite", async () => {
  const s = storage();
  sqlite.migrate(s.sql);
  s.db.run("CREATE TABLE orders (id TEXT PRIMARY KEY)");
  s.db.run("CREATE TABLE counter (n INTEGER NOT NULL)");
  s.db.run("INSERT INTO counter (n) VALUES (0)");
  return {
    async produce(order, event, fail) {
      s.transactionSync(() => {
        s.sql.exec(
          "INSERT INTO orders (id) VALUES (?) ON CONFLICT DO NOTHING",
          order,
        );
        sqlite.enqueue(s.sql, event, "evt.ws_1.superpipeline.card.completed");
        if (fail) throw new Error("the change failed");
      });
    },
    orders: async () =>
      s.db
        .query("SELECT id FROM orders WHERE id NOT LIKE '%again' ORDER BY id")
        .all()
        .map((r) => (r as { id: string }).id),
    outboxRows: async () =>
      s.db
        .query("SELECT id, attempts, dead FROM treaty_outbox ORDER BY seq")
        .all()
        .map((r) => {
          const row = r as { id: string; attempts: number; dead: number };
          return { id: row.id, attempts: row.attempts, dead: row.dead === 1 };
        }),
    drain: (send, nowMs) => sqlite.drain(s.sql, send, { nowMs }),
    async consume(event, fail) {
      return sqlite.handleOnce(s, event, () => {
        s.sql.exec("UPDATE counter SET n = n + 1");
        if (fail) throw new Error("the handler failed");
      });
    },
    counted: async () =>
      (s.db.query("SELECT n FROM counter").get() as { n: number }).n,
  };
});
