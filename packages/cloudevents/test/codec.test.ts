import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  fromBinary,
  percentDecode,
  percentEncode,
  toBinary,
  type Binding,
  type CloudEvent,
} from "../src/index.ts";

type Wire = { headers: Record<string, string>; body: string };
type EventCase = { attributes: Record<string, string>; body?: string };
const vectors = JSON.parse(
  readFileSync(
    join(import.meta.dir, "../../../fixtures/cloudevents/binary-mode.json"),
    "utf8",
  ),
) as {
  encode: Array<{ name: string; event: EventCase; http: Wire; nats: Wire }>;
  decode: Array<{
    name: string;
    binding: Binding;
    headers: Record<string, string>;
    body: string;
    event: EventCase;
  }>;
  reject: Array<{
    name: string;
    binding: Binding;
    headers: Record<string, string>;
    why: string;
  }>;
  percent: Array<{ decoded: string; encoded: string; decodeOnly?: boolean }>;
};

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data?: Uint8Array) =>
  new TextDecoder().decode(data ?? new Uint8Array());
const event = (c: EventCase): CloudEvent =>
  c.body
    ? { attributes: c.attributes, data: bytes(c.body) }
    : { attributes: c.attributes };

describe("encode, then decode back", () => {
  for (const v of vectors.encode) {
    for (const binding of ["http", "nats"] as const) {
      test(`${v.name} over ${binding}`, () => {
        const wire = toBinary(event(v.event), binding);
        expect(wire.headers).toEqual(v[binding].headers);
        expect(text(wire.body)).toBe(v[binding].body);
        const back = fromBinary(
          { headers: v[binding].headers, body: bytes(v[binding].body) },
          binding,
        );
        expect(back.attributes).toEqual(v.event.attributes);
        expect(text(back.data)).toBe(v.event.body ?? "");
      });
    }
  }
});

describe("decode what other senders send", () => {
  for (const v of vectors.decode) {
    test(v.name, () => {
      const got = fromBinary(
        { headers: v.headers, body: bytes(v.body) },
        v.binding,
      );
      expect(got.attributes).toEqual(v.event.attributes);
      expect(text(got.data)).toBe(v.event.body ?? "");
    });
  }
});

describe("reject", () => {
  for (const v of vectors.reject) {
    test(`${v.name}: ${v.why}`, () => {
      expect(() =>
        fromBinary({ headers: v.headers, body: new Uint8Array() }, v.binding),
      ).toThrow();
    });
  }
});

describe("percent-encoding", () => {
  for (const v of vectors.percent) {
    test(JSON.stringify(v.encoded), () => {
      expect(percentDecode(v.encoded)).toBe(v.decoded);
      if (!v.decodeOnly) expect(percentEncode(v.decoded)).toBe(v.encoded);
    });
  }
});

test("encoding refuses an event that is not valid", () => {
  expect(() =>
    toBinary({ attributes: { id: "x", source: "s", type: "t" } }, "nats"),
  ).toThrow();
});
