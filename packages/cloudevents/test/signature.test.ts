import { describe, expect, test } from "bun:test";
import { signDelivery, verifyDelivery } from "../src/index.ts";

const body = new TextEncoder().encode('{"card":"crd_1"}');
const now = 1_800_000_000_000;

describe("signed delivery", () => {
  test("a signature verifies for its id and body", async () => {
    const header = await signDelivery("s3cret", "evt-1", body, now);
    expect(header).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
    await verifyDelivery("s3cret", header, "evt-1", body, {
      nowMs: now + 10_000,
    });
  });

  const cases: Array<[string, (h: string) => Promise<void>]> = [
    [
      "another secret",
      (h) => verifyDelivery("other", h, "evt-1", body, { nowMs: now }),
    ],
    [
      "another id",
      (h) => verifyDelivery("s3cret", h, "evt-2", body, { nowMs: now }),
    ],
    [
      "another body",
      (h) =>
        verifyDelivery("s3cret", h, "evt-1", new TextEncoder().encode("{}"), {
          nowMs: now,
        }),
    ],
    [
      "too old",
      (h) =>
        verifyDelivery("s3cret", h, "evt-1", body, { nowMs: now + 301_000 }),
    ],
    [
      "from the future",
      (h) =>
        verifyDelivery("s3cret", h, "evt-1", body, { nowMs: now - 301_000 }),
    ],
    [
      "malformed",
      () => verifyDelivery("s3cret", "v1=abc", "evt-1", body, { nowMs: now }),
    ],
    [
      "missing",
      () => verifyDelivery("s3cret", null, "evt-1", body, { nowMs: now }),
    ],
  ];
  for (const [name, check] of cases) {
    test(`is refused: ${name}`, async () => {
      const header = await signDelivery("s3cret", "evt-1", body, now);
      await expect(check(header)).rejects.toThrow();
    });
  }
});
