import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createBundle } from "../src/schemas.ts";
import {
  checkTelemetryConventions,
  telemetryConventions,
  validateLogRecord,
  validatePropagation,
  validateSpanAttributes,
} from "../src/telemetry.ts";

const root = join(import.meta.dir, "../../..");
const META = "schemas/treaty/telemetry-conventions.v1.json";
const BASE =
  "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/";
const PATH = "schemas/telemetry/sample.v1.json";

const sample = {
  $schema: `${BASE}${META}`,
  $id: `${BASE}${PATH}`,
  conventions: "treaty telemetry conventions",
  version: 1,
  attributes: {
    "run.id": { type: "string", description: "The run." },
    "acp.seq_from": { type: "int", description: "First seq.", minimum: 0 },
    "attempt.state": {
      type: "string",
      description: "How it ended.",
      enum: ["completed", "failed"],
    },
  },
  spans: {
    attempt: {
      description: "One attempt.",
      producers: ["agentpod"],
      required: ["run.id", "acp.seq_from"],
      optional: ["attempt.state"],
    },
  },
  logs: {
    "run route": {
      description: "One request.",
      producers: ["superpipeline"],
      required: ["run.id"],
    },
  },
  propagation: {
    meta: {
      description: "ACP _meta.",
      carrier: "acp-meta",
      producers: ["agentpod"],
      fields: {
        traceparent: {
          required: true,
          schema: {
            type: "string",
            pattern: "^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$",
          },
        },
        tracestate: { required: false, schema: { type: "string" } },
      },
    },
  },
};
const TP = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
const cases = {
  spans: {
    attempt: {
      valid: { minimal: { "run.id": "r", "acp.seq_from": 1 } },
      invalid: [{ why: "no run", body: { "acp.seq_from": 1 } }],
    },
  },
  logs: {
    "run route": {
      valid: { one: { "run.id": "r" } },
      invalid: [{ why: "none", body: {} }],
    },
  },
  propagation: {
    meta: {
      valid: { tp: { traceparent: TP } },
      invalid: [{ why: "garbage", body: { traceparent: "nope" } }],
    },
  },
};
const files = (doc: unknown, caseFile: unknown = cases) =>
  createBundle({
    [META]: JSON.parse(readFileSync(join(root, META), "utf8")),
    [PATH]: doc,
    "fixtures/telemetry/sample.v1.cases.json": caseFile,
  });
const bundle = files(sample);
const conventions = telemetryConventions(bundle, "sample.v1");

describe("validateSpanAttributes", () => {
  test("accepts a span carrying its required keys with their types, ignoring keys not named", () => {
    expect(
      validateSpanAttributes(conventions, "attempt", {
        "run.id": "r",
        "acp.seq_from": 0,
        "attempt.state": "failed",
        "http.route": "/x",
      }),
    ).toEqual({ valid: true, errors: [] });
  });

  test("refuses a missing key, a wrong type, a value off the enum and one below the minimum", () => {
    expect(
      validateSpanAttributes(conventions, "attempt", { "acp.seq_from": "1" })
        .errors,
    ).toEqual(["run.id is required", "acp.seq_from is not an int"]);
    expect(
      validateSpanAttributes(conventions, "attempt", {
        "run.id": "r",
        "acp.seq_from": 1.5,
      }).errors,
    ).toEqual(["acp.seq_from is not an int"]);
    expect(
      validateSpanAttributes(conventions, "attempt", {
        "run.id": "r",
        "acp.seq_from": -1,
        "attempt.state": "done",
      }).errors,
    ).toEqual([
      "acp.seq_from is below 0",
      'attempt.state is not one of ["completed","failed"]',
    ]);
  });

  test("refuses a span the conventions do not name", () => {
    expect(validateSpanAttributes(conventions, "turn", {}).valid).toBe(false);
  });
});

describe("validateLogRecord and validatePropagation", () => {
  test("a log record is checked by its message", () => {
    expect(
      validateLogRecord(conventions, "run route", { "run.id": "r" }).valid,
    ).toBe(true);
    expect(validateLogRecord(conventions, "run route", {}).valid).toBe(false);
  });

  test("a carrier's fields are checked against their schemas", () => {
    expect(
      validatePropagation(bundle, conventions, "meta", { traceparent: TP })
        .valid,
    ).toBe(true);
    expect(
      validatePropagation(bundle, conventions, "meta", { traceparent: "nope" })
        .valid,
    ).toBe(false);
    expect(validatePropagation(bundle, conventions, "meta", {}).errors).toEqual(
      ["traceparent is required"],
    );
  });
});

describe("telemetryConventions and checkTelemetryConventions", () => {
  test("a name without its version is refused", () => {
    expect(() => telemetryConventions(bundle, "sample")).toThrow(/version/);
  });

  test("conventions whose cases answer as they say have no problems", () => {
    expect(checkTelemetryConventions(bundle, PATH)).toEqual([]);
  });

  test("a record naming a key that is no attribute is reported, and so is a span without cases", () => {
    const doc = {
      ...sample,
      spans: {
        ...sample.spans,
        turn: {
          description: "t",
          producers: ["agentpod"],
          required: ["turn.id"],
        },
      },
    };
    expect(checkTelemetryConventions(files(doc), PATH)).toEqual([
      "spans/turn names turn.id, which is no attribute",
      "spans/turn has no cases",
    ]);
  });

  test("an invalid case the conventions accept is reported", () => {
    const wrong = {
      ...cases,
      spans: {
        attempt: {
          valid: cases.spans.attempt.valid,
          invalid: [
            { why: "complete", body: { "run.id": "r", "acp.seq_from": 1 } },
          ],
        },
      },
    };
    expect(checkTelemetryConventions(files(sample, wrong), PATH)).toEqual([
      "spans/attempt accepts complete",
    ]);
  });
});
