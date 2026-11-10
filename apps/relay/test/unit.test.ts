import { describe, expect, test } from "bun:test";
import {
  fromBinary,
  verifyDelivery,
} from "../../../packages/cloudevents/src/index.ts";
import {
  allowedUrl,
  loadConfig,
  type Producer,
  type Subscriber,
} from "../src/config.ts";
import { deliverOne, retryDelayMs, type Delivered } from "../src/deliver.ts";
import { ingest, type Publisher } from "../src/ingest.ts";
import { subjectMatches } from "../src/subjects.ts";
import { event, request, SUBJECT, TOKEN_SHA256 } from "./helpers.ts";
import { toBinary } from "../../../packages/cloudevents/src/index.ts";

const producers: Producer[] = [
  {
    name: "superpipeline",
    tokenSha256: TOKEN_SHA256,
    subjects: ["evt.*.superpipeline.>"],
  },
];

function fakePublisher() {
  const seen = new Map<
    string,
    { subject: string; headers: Record<string, string>; body: Uint8Array }
  >();
  const publisher: Publisher = {
    async publish(subject, message) {
      const duplicate = seen.has(message.id);
      if (!duplicate)
        seen.set(message.id, {
          subject,
          headers: message.headers,
          body: message.body,
        });
      return { duplicate };
    },
  };
  return { publisher, seen };
}

describe("subject patterns", () => {
  const cases: Array<[string, string, boolean]> = [
    ["evt.*.superpipeline.>", SUBJECT, true],
    ["evt.*.superpipeline.>", "evt.ws_1.agentpod.gate.pending", false],
    ["evt.ws_1.superpipeline.gate.pending", SUBJECT, true],
    ["evt.*.superpipeline.gate.*", SUBJECT, true],
    ["evt.*.superpipeline.gate", SUBJECT, false],
    ["evt.>", "evt", false],
  ];
  for (const [pattern, subject, expected] of cases) {
    test(`${pattern} ${expected ? "matches" : "does not match"} ${subject}`, () => {
      expect(subjectMatches(pattern, subject)).toBe(expected);
    });
  }
});

describe("ingest", () => {
  test("publishes the event in NATS binary mode under its id, and a resend is a duplicate", async () => {
    const { publisher, seen } = fakePublisher();
    const handle = ingest(producers, publisher);
    const first = await handle(request(event()));
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ id: "evt-1", duplicate: false });
    expect(await (await handle(request(event()))).json()).toEqual({
      id: "evt-1",
      duplicate: true,
    });
    const stored = seen.get("evt-1")!;
    expect(stored.subject).toBe(SUBJECT);
    expect(stored.headers["ce-datacontenttype"]).toBe("application/json");
    expect(
      fromBinary({ headers: stored.headers, body: stored.body }, "nats")
        .attributes["id"],
    ).toBe("evt-1");
  });

  const refusals: Array<[string, () => Request, number, string]> = [
    [
      "no token",
      () => request(event(), { token: null }),
      401,
      "unauthenticated",
    ],
    [
      "an unknown token",
      () => request(event(), { token: "nope" }),
      401,
      "unauthenticated",
    ],
    [
      "another product's subject",
      () =>
        request(event("e", "com.superjackfruit.agentpod.gate.pending.v1"), {
          subject: "evt.ws_1.agentpod.gate.pending",
        }),
      403,
      "subject_not_allowed",
    ],
    [
      "a subject that is not a suite subject",
      () => request(event(), { subject: "evt.ws_1.superpipeline.gate" }),
      400,
      "bad_subject",
    ],
    [
      "a type for another verb",
      () =>
        request(
          event("e", "com.superjackfruit.superpipeline.gate.resolved.v1"),
        ),
      422,
      "type_does_not_match_subject",
    ],
    [
      "a type that is not a suite type",
      () => request(event("e", "com.example.thing")),
      422,
      "bad_type",
    ],
    [
      "a body that is not an event",
      () =>
        new Request(`http://relay.test/v1/events/${SUBJECT}`, {
          method: "POST",
          headers: { authorization: "Bearer producer-token" },
          body: "{}",
        }),
      400,
      "bad_event",
    ],
  ];
  for (const [name, make, status, error] of refusals) {
    test(`refuses ${name}`, async () => {
      const { publisher, seen } = fakePublisher();
      const response = await ingest(producers, publisher)(make());
      expect(response.status).toBe(status);
      expect((await response.json()).error).toBe(error);
      expect(seen.size).toBe(0);
    });
  }

  test("answers 503 when JetStream refuses the publish", async () => {
    const failing: Publisher = {
      publish: async () => {
        throw new Error("no responders");
      },
    };
    expect((await ingest(producers, failing)(request(event()))).status).toBe(
      503,
    );
  });
});

describe("deliverOne", () => {
  const subscriber: Subscriber = {
    name: "hub",
    url: "https://hub.test/events",
    secret: "s3cret",
    filter: "evt.>",
    maxDeliver: 5,
  };

  function message(deliveryCount = 1) {
    const wire = toBinary(event(), "nats");
    const calls: string[] = [];
    const m: Delivered = {
      subject: SUBJECT,
      headers: wire.headers,
      data: wire.body,
      deliveryCount,
      ack: () => void calls.push("ack"),
      nak: (ms) => void calls.push(`nak ${ms}`),
      term: (r) => void calls.push(`term ${r}`),
    };
    return { m, calls };
  }

  test("posts a signed HTTP binary-mode event and acknowledges a 2xx", async () => {
    const { m, calls } = message();
    let seen:
      | { url: string; headers: Record<string, string>; body: Uint8Array }
      | undefined;
    const outcome = await deliverOne(subscriber, m, async (url, init) => {
      seen = {
        url,
        headers: init.headers as Record<string, string>,
        body: new Uint8Array(init.body as ArrayBuffer),
      };
      return new Response(null, { status: 204 });
    });
    expect(outcome).toBe("delivered");
    expect(calls).toEqual(["ack"]);
    expect(seen!.url).toBe("https://hub.test/events");
    expect(seen!.headers["content-type"]).toBe("application/json");
    expect(seen!.headers["ce-id"]).toBe("evt-1");
    await verifyDelivery(
      "s3cret",
      seen!.headers["x-treaty-signature"]!,
      "evt-1",
      seen!.body,
    );
  });

  for (const status of [500, 503, 429, 408]) {
    test(`retries after a ${status}, with a backoff that grows`, async () => {
      const { m, calls } = message(3);
      expect(
        await deliverOne(
          subscriber,
          m,
          async () => new Response(null, { status }),
        ),
      ).toBe("retry");
      expect(calls).toEqual([`nak ${retryDelayMs(3)}`]);
      expect(retryDelayMs(3)).toBeGreaterThan(retryDelayMs(1));
    });
  }

  test("retries when the network fails", async () => {
    const { m, calls } = message();
    expect(
      await deliverOne(subscriber, m, async () => {
        throw new Error("ECONNREFUSED");
      }),
    ).toBe("retry");
    expect(calls).toEqual(["nak 1000"]);
  });

  test("drops an event the subscriber refuses with another 4xx", async () => {
    const { m, calls } = message();
    expect(
      await deliverOne(
        subscriber,
        m,
        async () => new Response(null, { status: 400 }),
      ),
    ).toBe("dropped");
    expect(calls).toEqual(["term hub answered 400"]);
  });

  test("drops a message that is not a valid event", async () => {
    const { m, calls } = message();
    m.headers = {};
    expect(
      await deliverOne(
        subscriber,
        m,
        async () => new Response(null, { status: 204 }),
      ),
    ).toBe("dropped");
    expect(calls[0]).toStartWith("term not a valid event");
  });

  test("caps the backoff at five minutes", () => {
    expect(retryDelayMs(50)).toBe(300_000);
  });
});

describe("loadConfig", () => {
  const producer = JSON.stringify([
    {
      name: "superpipeline",
      tokenSha256: TOKEN_SHA256,
      subjects: ["evt.*.superpipeline.>"],
    },
  ]);
  test("reads producers, subscribers and defaults", () => {
    const config = loadConfig({
      TREATY_RELAY_PRODUCERS: producer,
      TREATY_RELAY_SUBSCRIBERS: JSON.stringify([
        {
          name: "hub",
          url: "https://hub.test/e",
          secret: "s",
          filter: "evt.>",
        },
      ]),
    });
    expect(config.producers[0]!.name).toBe("superpipeline");
    expect(config.subscribers[0]!.maxDeliver).toBe(10);
    expect(config.natsUrl).toBe("nats://127.0.0.1:4222");
    expect(config.work.duplicateWindowMs).toBe(3_600_000);
  });
  const bad: Array<[string, Record<string, string>]> = [
    [
      "a token that is not a SHA-256",
      {
        TREATY_RELAY_PRODUCERS: JSON.stringify([
          { name: "p", tokenSha256: "abc", subjects: ["evt.>"] },
        ]),
      },
    ],
    [
      "a producer with no subjects",
      {
        TREATY_RELAY_PRODUCERS: JSON.stringify([
          { name: "p", tokenSha256: TOKEN_SHA256, subjects: [] },
        ]),
      },
    ],
    [
      "a plain-http subscriber",
      {
        TREATY_RELAY_SUBSCRIBERS: JSON.stringify([
          {
            name: "hub",
            url: "http://hub.test/e",
            secret: "s",
            filter: "evt.>",
          },
        ]),
      },
    ],
    [
      "a subscriber name NATS cannot use",
      {
        TREATY_RELAY_SUBSCRIBERS: JSON.stringify([
          { name: "a.b", url: "https://h.test", secret: "s", filter: "evt.>" },
        ]),
      },
    ],
    ["a negative retention", { TREATY_RELAY_WORK_MAX_AGE_HOURS: "-1" }],
  ];
  for (const [name, env] of bad) {
    test(`refuses ${name}`, () => {
      expect(() => loadConfig(env)).toThrow();
    });
  }
});

describe("subscriber URLs", () => {
  const cases: Array<[string, boolean]> = [
    ["https://hub.example.com/events", true],
    ["http://localhost:9000/e", true],
    ["http://127.0.0.1:9000/e", true],
    ["http://sink:9000/events", true],
    ["http://hub.example.com/events", false],
    ["http://10.0.0.5/events", false],
    ["ftp://sink/e", false],
    ["not a url", false],
  ];
  for (const [url, ok] of cases) {
    test(`${url} is ${ok ? "allowed" : "refused"}`, () => {
      expect(allowedUrl(url)).toBe(ok);
    });
  }
});
