/**
 * The behaviour both adapters must have, written once. Each adapter's test supplies a store.
 */
import type {
  describe as Describe,
  expect as Expect,
  test as Test,
} from "bun:test";
import type { OutboxEvent, PendingEvent } from "../src/index.ts";

export interface Store {
  /** A change (one order row) and its event, in one transaction; `fail` throws after both. */
  produce(order: string, event: OutboxEvent, fail?: boolean): Promise<void>;
  orders(): Promise<string[]>;
  outboxRows(): Promise<Array<{ id: string; attempts: number; dead: boolean }>>;
  drain(
    send: (p: PendingEvent) => Promise<void>,
    nowMs: number,
  ): Promise<{ sent: number; failed: number }>;
  /** A consumer that counts what it was told; `fail` throws inside the handler. */
  consume(event: OutboxEvent, fail?: boolean): Promise<"handled" | "duplicate">;
  counted(): Promise<number>;
}

const event = (id: string): OutboxEvent => ({
  attributes: {
    specversion: "1.0",
    id,
    source: "/boards/brd_1",
    type: "com.superjackfruit.superpipeline.card.completed.v1",
  },
  data: new TextEncoder().encode(`{"card":"${id}"}`),
});

/** Bun caches a shared module, so each test file passes in its own describe, test and expect. */
export interface Runner {
  describe: typeof Describe;
  test: typeof Test;
  expect: typeof Expect;
}

export function scenarios(
  { describe, test, expect }: Runner,
  name: string,
  open: () => Promise<Store>,
): void {
  describe(`${name}: producing`, () => {
    test("the event is written with the change, and only with it", async () => {
      const s = await open();
      await s.produce("o1", event("e1"));
      await expect(s.produce("o2", event("e2"), true)).rejects.toThrow();
      expect(await s.orders()).toEqual(["o1"]);
      expect((await s.outboxRows()).map((r) => r.id)).toEqual(["e1"]);
    });

    test("enqueuing the same event twice stores it once", async () => {
      const s = await open();
      await s.produce("o1", event("e1"));
      await s.produce("o1-again", event("e1"));
      expect((await s.outboxRows()).map((r) => r.id)).toEqual(["e1"]);
    });
  });

  describe(`${name}: draining`, () => {
    test("sends due events in order with their data, then clears them", async () => {
      const s = await open();
      await s.produce("o1", event("e1"));
      await s.produce("o2", event("e2"));
      const seen: string[] = [];
      expect(
        await s.drain(
          async (p) =>
            void seen.push(
              `${p.event.attributes["id"]}:${new TextDecoder().decode(p.event.data)}`,
            ),
          Date.now(),
        ),
      ).toEqual({ sent: 2, failed: 0 });
      expect(seen).toEqual(['e1:{"card":"e1"}', 'e2:{"card":"e2"}']);
      expect(await s.outboxRows()).toEqual([]);
    });

    test("a failed send is retried after its backoff, and parked once out of attempts", async () => {
      const s = await open();
      await s.produce("o1", event("e1"));
      const t0 = Date.now();
      const fail = async () => {
        throw new Error("relay down");
      };
      expect(await s.drain(fail, t0)).toEqual({ sent: 0, failed: 1 });
      expect(await s.drain(fail, t0 + 1)).toEqual({ sent: 0, failed: 0 });
      let t = t0;
      for (let i = 0; i < 20; i++) {
        t += 4 * 3_600_000;
        await s.drain(fail, t);
      }
      const [row] = await s.outboxRows();
      expect(row).toMatchObject({ id: "e1", dead: true, attempts: 12 });
      expect(await s.drain(async () => {}, t + 10 * 3_600_000)).toEqual({
        sent: 0,
        failed: 0,
      });
    });
  });

  describe(`${name}: consuming`, () => {
    test("replaying the same event twice changes nothing", async () => {
      const s = await open();
      expect(await s.consume(event("e1"))).toBe("handled");
      expect(await s.consume(event("e1"))).toBe("duplicate");
      expect(await s.consume(event("e1"))).toBe("duplicate");
      expect(await s.counted()).toBe(1);
    });

    test("the same id from another source is another event", async () => {
      const s = await open();
      const other = event("e1");
      other.attributes = { ...other.attributes, source: "/boards/brd_2" };
      await s.consume(event("e1"));
      expect(await s.consume(other)).toBe("handled");
      expect(await s.counted()).toBe(2);
    });

    test("a handler that fails leaves no record, so the event is handled when it comes again", async () => {
      const s = await open();
      await expect(s.consume(event("e1"), true)).rejects.toThrow();
      expect(await s.counted()).toBe(0);
      expect(await s.consume(event("e1"))).toBe("handled");
      expect(await s.counted()).toBe(1);
    });

    test("end to end: a send repeated after a crash is handled once", async () => {
      const s = await open();
      await s.produce("o1", event("e1"));
      const delivered: PendingEvent[] = [];
      await s.drain(async (p) => void delivered.push(p), Date.now());
      for (const p of [...delivered, ...delivered]) await s.consume(p.event);
      expect(await s.counted()).toBe(1);
    });
  });
}
