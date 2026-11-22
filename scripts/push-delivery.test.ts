/**
 * fixtures/cloudevents/push-delivery.json: SuperPipeline's direct push on the relay's envelope.
 * Every vector is re-signed and re-encoded here with treaty-cloudevents, so a vector that drifts
 * from `signDelivery` or `toBinary`, or a codec change that would break a receiver checking the
 * vectors, fails.
 */
import { describe, expect, test } from "bun:test";
import { Validator } from "@cfworker/json-schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SIGNATURE_HEADER,
  signDelivery,
  toBinary,
  verifyDelivery,
} from "../packages/cloudevents/src/index.ts";

const root = join(import.meta.dir, "..");
const read = (path: string): unknown =>
  JSON.parse(readFileSync(join(root, path), "utf8"));
const RAW = "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/";
const UTF8 = new TextEncoder();

interface Wire {
  headers: Record<string, string>;
  body: string;
}
interface Delivery {
  name: string;
  secret: string;
  t: number;
  data: string;
  event: { attributes: Record<string, string> };
  http: Wire;
}
interface Refusal {
  name: string;
  why: string;
  secret: string;
  nowSeconds: number;
  http: Wire;
}
interface Vectors {
  toleranceSeconds: number;
  deliveries: Delivery[];
  refuse: Refusal[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const isStrings = (v: unknown): v is Record<string, string> =>
  isObject(v) && Object.values(v).every((x) => typeof x === "string");
const isWire = (v: unknown): v is Wire =>
  isObject(v) && isStrings(v.headers) && typeof v.body === "string";
const isDelivery = (v: unknown): v is Delivery =>
  isObject(v) &&
  typeof v.name === "string" &&
  typeof v.secret === "string" &&
  typeof v.t === "number" &&
  typeof v.data === "string" &&
  isObject(v.event) &&
  isStrings(v.event.attributes) &&
  isWire(v.http);
const isRefusal = (v: unknown): v is Refusal =>
  isObject(v) &&
  typeof v.name === "string" &&
  typeof v.why === "string" &&
  typeof v.secret === "string" &&
  typeof v.nowSeconds === "number" &&
  isWire(v.http);
function isVectors(v: unknown): v is Vectors {
  return (
    isObject(v) &&
    typeof v.toleranceSeconds === "number" &&
    Array.isArray(v.deliveries) &&
    v.deliveries.every(isDelivery) &&
    Array.isArray(v.refuse) &&
    v.refuse.every(isRefusal)
  );
}

const loaded = read("fixtures/cloudevents/push-delivery.json");
if (!isVectors(loaded))
  throw new Error("fixtures/cloudevents/push-delivery.json is malformed");
const vectors = loaded;

/** Follows `file#/a/b` from fixtures/ (RFC 6901 pointer). */
function example(ref: string): unknown {
  const [file = "", pointer = ""] = ref.split("#");
  return pointer
    .split("/")
    .slice(1)
    .map((t) => t.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>(
      (node, key) => (isObject(node) ? node[key] : undefined),
      read(`fixtures/${file}`),
    );
}

function withoutSignature(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name !== SIGNATURE_HEADER),
  );
}

describe("fixtures/cloudevents/push-delivery.json", () => {
  test("has deliveries and refusals, and the relay's window", () => {
    expect(vectors.deliveries.length).toBeGreaterThan(0);
    expect(vectors.refuse.length).toBeGreaterThan(0);
    expect(vectors.toleranceSeconds).toBe(300);
  });

  test("every secret is plainly fake", () => {
    const secrets = [...vectors.deliveries, ...vectors.refuse].map(
      (v) => v.secret,
    );
    expect(secrets.filter((s) => !s.startsWith("fake-"))).toEqual([]);
  });

  for (const d of vectors.deliveries) {
    const body = UTF8.encode(d.http.body);
    const id = d.event.attributes["id"] ?? "";

    test(`${d.name}: encodes to its headers`, () => {
      const wire = toBinary(
        { attributes: d.event.attributes, data: body },
        "http",
      );
      expect(wire.headers).toEqual(withoutSignature(d.http.headers));
      expect(new TextDecoder().decode(wire.body)).toBe(d.http.body);
    });

    test(`${d.name}: signs to its x-treaty-signature`, async () => {
      expect(await signDelivery(d.secret, id, body, d.t * 1000)).toBe(
        d.http.headers[SIGNATURE_HEADER] ?? "",
      );
    });

    test(`${d.name}: verifies at t and at the window's edge`, async () => {
      const header = d.http.headers[SIGNATURE_HEADER] ?? null;
      await verifyDelivery(d.secret, header, id, body, { nowMs: d.t * 1000 });
      await verifyDelivery(d.secret, header, id, body, {
        nowMs: (d.t + vectors.toleranceSeconds) * 1000,
      });
    });

    test(`${d.name}: its body is the example it names, valid under its dataschema`, () => {
      const data: unknown = JSON.parse(d.http.body);
      expect(data).toEqual(example(d.data));
      const dataschema = d.event.attributes["dataschema"] ?? "";
      expect(dataschema.startsWith(RAW)).toBe(true);
      const validator = new Validator(
        JSON.parse(
          readFileSync(join(root, dataschema.slice(RAW.length)), "utf8"),
        ),
        "2020-12",
        false,
      );
      expect(validator.validate(data).errors).toEqual([]);
    });

    test(`${d.name}: its id is <boardId>:<seq>, its source the board`, () => {
      const data = example(d.data);
      const boardId =
        isObject(data) && typeof data.boardId === "string" ? data.boardId : "";
      expect(boardId).toMatch(/^brd_[0-9a-f]{16}$/);
      expect(id).toMatch(new RegExp(`^${boardId}:[0-9]+$`));
      expect(d.event.attributes["source"]).toBe(
        `/superpipeline/boards/${boardId}`,
      );
    });
  }

  for (const r of vectors.refuse) {
    test(`refuses ${r.name}: ${r.why}`, async () => {
      const refused = await verifyDelivery(
        r.secret,
        r.http.headers[SIGNATURE_HEADER] ?? null,
        r.http.headers["ce-id"] ?? "",
        UTF8.encode(r.http.body),
        { nowMs: r.nowSeconds * 1000 },
      ).then(
        () => false,
        () => true,
      );
      expect(refused).toBe(true);
    });
  }
});

/**
 * The service form of push registration is tighter than the agent form, and the operation's
 * request is the union of both, so these cases are checked against the service schema itself.
 */
describe("schemas/http/superpipeline/push.v1.openapi.json: ServicePushConfigRequest", () => {
  const doc = read("schemas/http/superpipeline/push.v1.openapi.json");
  const cases = read("fixtures/http/superpipeline/push.v1.cases.json");
  const schema =
    isObject(doc) &&
    isObject(doc.components) &&
    isObject(doc.components.schemas)
      ? doc.components.schemas["ServicePushConfigRequest"]
      : undefined;
  const own =
    isObject(cases) && isObject(cases.schemas)
      ? cases.schemas["ServicePushConfigRequest"]
      : undefined;
  const valid = isObject(own) && isObject(own.valid) ? own.valid : {};
  const invalid =
    isObject(own) && Array.isArray(own.invalid)
      ? own.invalid.filter(isObject)
      : [];
  const validator = new Validator(
    isObject(schema) ? schema : {},
    "2020-12",
    false,
  );

  test("has cases", () => {
    expect(isObject(schema)).toBe(true);
    expect(Object.keys(valid).length).toBeGreaterThan(0);
    expect(invalid.length).toBeGreaterThan(0);
  });
  for (const [label, body] of Object.entries(valid)) {
    test(`accepts ${label}`, () => {
      expect(validator.validate(body).errors).toEqual([]);
    });
  }
  for (const c of invalid) {
    test(`refuses: ${String(c.why)}`, () => {
      expect(validator.validate(c.body).valid).toBe(false);
    });
  }
});
