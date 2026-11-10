/**
 * The relay against a real nats-server with JetStream. CI starts one and sets NATS_URL (and
 * TREATY_REQUIRE_NATS=1, so a CI run without it fails instead of skipping). Locally, start one
 * with `nats-server -js` and set NATS_URL to run these.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { jetstreamManager } from "@nats-io/jetstream";
import type { NatsConnection } from "@nats-io/transport-node";
import { verifyDelivery } from "../../../packages/cloudevents/src/index.ts";
import type { Subscriber } from "../src/config.ts";
import { ingest } from "../src/ingest.ts";
import {
  AUDIT_STREAM,
  ensureStreams,
  open,
  publisher,
  startDelivery,
  WORK_STREAM,
} from "../src/nats.ts";
import { event, request, TOKEN_SHA256 } from "./helpers.ts";

const NATS_URL = process.env["NATS_URL"];
if (!NATS_URL && process.env["TREATY_REQUIRE_NATS"] === "1") {
  throw new Error(
    "TREATY_REQUIRE_NATS=1 but NATS_URL is not set: the relay's NATS tests must run here",
  );
}
const suite = NATS_URL ? describe : describe.skip;
if (!NATS_URL)
  console.warn("relay: NATS_URL is not set, so the NATS tests are skipped");

const retention = {
  work: { maxAgeMs: 3_600_000, duplicateWindowMs: 120_000 },
  audit: { maxAgeMs: 3_600_000 },
};
const producers = [
  {
    name: "superpipeline",
    tokenSha256: TOKEN_SHA256,
    subjects: ["evt.*.superpipeline.>"],
  },
];

suite("relay on JetStream", () => {
  let nc: NatsConnection;

  beforeAll(async () => {
    nc = await open(NATS_URL!);
    const jsm = await jetstreamManager(nc);
    for (const name of [WORK_STREAM, AUDIT_STREAM])
      await jsm.streams.delete(name).catch(() => {});
    await ensureStreams(nc, retention);
  });
  afterAll(async () => {
    await nc.drain();
  });

  test("creates the two streams, and creating them again changes nothing", async () => {
    await ensureStreams(nc, retention);
    const jsm = await jetstreamManager(nc);
    const work = await jsm.streams.info(WORK_STREAM);
    const audit = await jsm.streams.info(AUDIT_STREAM);
    expect(work.config.subjects).toEqual(["evt.>"]);
    expect(audit.config.subjects).toEqual(["audit.>"]);
    expect(work.config.duplicate_window).toBe(120_000 * 1_000_000);
  });

  test("an event sent twice is stored once (Nats-Msg-Id is the event id)", async () => {
    const handle = ingest(producers, publisher(nc));
    const subject = "evt.ws_dup.superpipeline.gate.pending";
    expect(
      await (await handle(request(event("dup-1"), { subject }))).json(),
    ).toEqual({ id: "dup-1", duplicate: false });
    expect(
      await (await handle(request(event("dup-1"), { subject }))).json(),
    ).toEqual({ id: "dup-1", duplicate: true });
    const jsm = await jetstreamManager(nc);
    const info = await jsm.streams.info(WORK_STREAM, {
      subjects_filter: subject,
    });
    expect(info.state.subjects?.[subject]).toBe(1);
  });

  test("delivers to a subscriber signed, retries until it answers, and does not deliver a resend again", async () => {
    const received: string[] = [];
    let failuresLeft = 2;
    const worker = Bun.serve({
      port: 0,
      async fetch(req) {
        const body = new Uint8Array(await req.arrayBuffer());
        const id = req.headers.get("ce-id")!;
        await verifyDelivery(
          "worker-secret",
          req.headers.get("x-treaty-signature"),
          id,
          body,
        );
        if (failuresLeft-- > 0) return new Response(null, { status: 503 });
        received.push(id);
        return new Response(null, { status: 204 });
      },
    });
    const subscriber: Subscriber = {
      name: "worker-retry",
      url: `http://localhost:${worker.port}/events`,
      secret: "worker-secret",
      filter: "evt.ws_retry.superpipeline.>",
      maxDeliver: 5,
    };
    const stop = await startDelivery(nc, [subscriber]);
    try {
      const handle = ingest(producers, publisher(nc));
      const subject = "evt.ws_retry.superpipeline.gate.pending";
      await handle(request(event("retry-1"), { subject }));
      await handle(request(event("retry-1"), { subject }));
      const deadline = Date.now() + 15_000;
      while (received.length === 0 && Date.now() < deadline)
        await Bun.sleep(100);
      await Bun.sleep(1500);
      expect(received).toEqual(["retry-1"]);
      expect(failuresLeft).toBe(-1);
    } finally {
      await stop();
      await worker.stop(true);
    }
  }, 30_000);

  test("a subscriber only receives the subjects its filter names", async () => {
    const received: string[] = [];
    const worker = Bun.serve({
      port: 0,
      async fetch(req) {
        received.push(req.headers.get("ce-type")!);
        return new Response(null, { status: 204 });
      },
    });
    const stop = await startDelivery(nc, [
      {
        name: "worker-gates",
        url: `http://localhost:${worker.port}/e`,
        secret: "s",
        filter: "evt.ws_filter.superpipeline.gate.pending",
        maxDeliver: 3,
      },
    ]);
    try {
      const handle = ingest(producers, publisher(nc));
      await handle(
        request(event("f-1"), {
          subject: "evt.ws_filter.superpipeline.gate.pending",
        }),
      );
      await handle(
        request(
          event("f-2", "com.superjackfruit.superpipeline.gate.resolved.v1"),
          { subject: "evt.ws_filter.superpipeline.gate.resolved" },
        ),
      );
      const deadline = Date.now() + 10_000;
      while (received.length === 0 && Date.now() < deadline)
        await Bun.sleep(100);
      await Bun.sleep(1000);
      expect(received).toEqual([
        "com.superjackfruit.superpipeline.gate.pending.v1",
      ]);
    } finally {
      await stop();
      await worker.stop(true);
    }
  }, 30_000);
});
