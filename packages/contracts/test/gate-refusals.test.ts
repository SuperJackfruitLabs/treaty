import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compareOpenApi } from "../src/compat.ts";
import { openApi, validateResponse } from "../src/http.ts";
import { checkOpenApi } from "../src/openapi-check.ts";
import type { Registry } from "../src/registry.ts";
import { createBundle } from "../src/schemas.ts";

/**
 * `x-treaty-gate-refusals`: a refusal a gate in front of every route answers with, in another of
 * the suite's envelopes than the document's (SuperPipeline's Organization-plane entitlement check).
 */
const root = join(import.meta.dir, "../../..");
const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
/** A JSON file that holds an object, as a record. */
function record(path: string): Record<string, unknown> {
  const value = json(path);
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path} is not an object`);
  return Object.fromEntries(Object.entries(value));
}
const DOC = "schemas/http/superpipeline/sample.v1.openapi.json";
const CASES = "fixtures/http/superpipeline/sample.v1.cases.json";
const ORG = "org_0123456789abcdef0123";

const gate = () => ({
  "403": {
    description: "The entitlement check, before any route.",
    envelope: "flat-error.v1",
    codes: ["product_not_enabled"],
    schema: {
      $ref: "../../common/flat-error.v1.json",
      required: ["error", "org"],
      properties: {
        error: { const: "product_not_enabled" },
        org: { type: "string", pattern: "^org_[0-9a-f]{20}$" },
      },
    },
  },
});
const gateCases = () => ({
  "403": {
    valid: { "not enabled": { error: "product_not_enabled", org: ORG } },
    invalid: [{ why: "no org", body: { error: "product_not_enabled" } }],
  },
});

const codes = {
  registry: "treaty error codes",
  version: 2,
  codes: [
    {
      code: "NOT_RUN_OWNER",
      owner: "superpipeline",
      envelope: "error.v1",
      status: 403,
      meaning: "not yours",
    },
    {
      code: "product_not_enabled",
      owner: "superpipeline",
      envelope: "flat-error.v1",
      status: 403,
      meaning: "not enabled",
    },
    {
      code: "forbidden",
      owner: "agentpod",
      envelope: "flat-error.v1",
      status: 403,
      meaning: "another owner's",
    },
    {
      code: "M_FORBIDDEN",
      owner: "superpipeline",
      envelope: "matrix-error.v1",
      status: 403,
      meaning: "a Matrix code",
    },
  ],
};

const registry: Registry = {
  registry: "treaty crossings",
  version: 1,
  crossings: [
    {
      id: "superpipeline.sample",
      title: "Sample",
      owner: "superpipeline",
      consumers: ["agentpod"],
      kind: "http",
      status: "contracted",
      contract: [DOC],
      evidence: ["superpipeline:apps/api/src/index.ts"],
    },
  ],
};

type Doc = Record<string, unknown> & {
  "x-treaty-gate-refusals"?: Record<string, Record<string, unknown>>;
};
type CasesFile = Record<string, unknown> & {
  gateRefusals?: Record<string, unknown>;
};

/** The sample document with a gate, and its cases; `edit` changes fresh copies of both. */
function bundleWith(edit?: (doc: Doc, cases: CasesFile) => void) {
  const doc: Doc = {
    ...record(join(import.meta.dir, "fixtures/sample.openapi.json")),
    "x-treaty-gate-refusals": gate(),
  };
  const cases: CasesFile = {
    ...record(join(import.meta.dir, "fixtures/sample.cases.json")),
    gateRefusals: gateCases(),
  };
  edit?.(doc, cases);
  return createBundle({
    "schemas/common/error.v1.json": json(
      join(root, "schemas/common/error.v1.json"),
    ),
    "schemas/common/flat-error.v1.json": json(
      join(root, "schemas/common/flat-error.v1.json"),
    ),
    "contracts/error-codes.json": codes,
    [DOC]: doc,
    [CASES]: cases,
  });
}
const check = (edit?: (doc: Doc, cases: CasesFile) => void) =>
  checkOpenApi(bundleWith(edit), DOC, registry).join("\n");
const the403 = (doc: Doc) => doc["x-treaty-gate-refusals"]?.["403"] ?? {};

describe("checkOpenApi: x-treaty-gate-refusals", () => {
  test("a gate refusal in another suite envelope, with its owner's code and cases, keeps every rule", () => {
    expect(check()).toBe("");
  });

  const broken: [string, (doc: Doc, cases: CasesFile) => void, string][] = [
    [
      "a status that is not an error",
      (doc, cases) => {
        doc["x-treaty-gate-refusals"] = { "200": the403(doc) };
        cases.gateRefusals = { "200": gateCases()["403"] };
      },
      "a gate refusal's status is a 4xx or 5xx",
    ],
    [
      "a gate with no description",
      (doc) => {
        delete the403(doc).description;
      },
      "has no description",
    ],
    [
      "an envelope treaty does not define",
      (doc) => {
        the403(doc).envelope = "problem+json";
      },
      'envelope is "problem+json"',
    ],
    [
      "a schema that is not the declared envelope",
      (doc) => {
        the403(doc).schema = { type: "object" };
      },
      "its schema must be schemas/common/flat-error.v1.json",
    ],
    [
      "a gate that names no codes",
      (doc) => {
        the403(doc).codes = [];
      },
      "names no codes",
    ],
    [
      "another owner's code",
      (doc, cases) => {
        the403(doc).codes = ["forbidden"];
        cases.gateRefusals = {
          "403": {
            valid: { other: { error: "forbidden", org: ORG } },
            invalid: [],
          },
        };
      },
      "error code forbidden is not superpipeline's",
    ],
    [
      "a code recorded in another envelope than the gate's",
      (doc) => {
        the403(doc).codes = ["product_not_enabled", "M_FORBIDDEN"];
      },
      "error code M_FORBIDDEN travels in matrix-error.v1, not flat-error.v1",
    ],
    [
      "a gate with no cases",
      (_doc, cases) => {
        delete cases.gateRefusals;
      },
      "x-treaty-gate-refusals 403 has no valid cases",
    ],
    [
      "a gate with no invalid cases",
      (_doc, cases) => {
        cases.gateRefusals = {
          "403": { valid: gateCases()["403"].valid, invalid: [] },
        };
      },
      "x-treaty-gate-refusals 403 has no invalid cases",
    ],
    [
      "a valid case the schema refuses",
      (_doc, cases) => {
        cases.gateRefusals = {
          "403": {
            valid: { "no org": { error: "product_not_enabled" } },
            invalid: gateCases()["403"].invalid,
          },
        };
      },
      'valid case "no org" fails',
    ],
    [
      "a valid case carrying a code the gate does not name",
      (doc, cases) => {
        Reflect.set(Object(the403(doc).schema), "properties", {});
        cases.gateRefusals = {
          "403": {
            valid: { other: { error: "something_else", org: ORG } },
            invalid: [{ why: "not flat", body: { error: { code: "X" } } }],
          },
        };
      },
      'valid case "other" carries "something_else", not a code the gate names',
    ],
    [
      "an invalid case the schema accepts",
      (_doc, cases) => {
        cases.gateRefusals = {
          "403": {
            valid: gateCases()["403"].valid,
            invalid: [
              {
                why: "fine really",
                body: { error: "product_not_enabled", org: ORG },
              },
            ],
          },
        };
      },
      'invalid case "fine really" passes',
    ],
    [
      "cases for a gate the document does not declare",
      (doc, cases) => {
        delete doc["x-treaty-gate-refusals"];
        cases.gateRefusals = gateCases();
      },
      "gateRefusals 403 has cases but no x-treaty-gate-refusals entry",
    ],
    [
      "a declaration that is not keyed by status",
      (doc) => {
        Reflect.set(doc, "x-treaty-gate-refusals", [the403(doc)]);
      },
      "x-treaty-gate-refusals must be an object keyed by status",
    ],
  ];
  for (const [what, edit, expected] of broken) {
    test(`refuses ${what}`, () => {
      expect(check(edit)).toContain(expected);
    });
  }

  test("the gate's code is not one an operation may name in the document's envelope", () => {
    expect(
      check((doc) => {
        const item: unknown = Reflect.get(
          Object(doc.paths),
          "/v1/boards/{boardId}/cards/{cardId}",
        );
        Reflect.set(
          Object(Reflect.get(Object(item), "get")),
          "x-treaty-error-codes",
          ["product_not_enabled"],
        );
      }),
    ).toContain(
      "error code product_not_enabled travels in flat-error.v1, not error.v1",
    );
  });
});

describe("validateResponse with a gate refusal", () => {
  const bundle = bundleWith();
  const api = openApi(bundle, DOC);
  const refusal = { error: "product_not_enabled", org: ORG };

  test("openApi reads the gate's status and schema", () => {
    expect(api.gateRefusals).toEqual({
      "403": "/x-treaty-gate-refusals/403/schema",
    });
  });

  test("a document without a gate has none", () => {
    const plain = createBundle({
      [DOC]: json(join(import.meta.dir, "fixtures/sample.openapi.json")),
    });
    expect(openApi(plain, DOC).gateRefusals).toBeUndefined();
  });

  test("accepts the gate's refusal where the operation answers its status in another envelope", () => {
    expect(validateResponse(bundle, api, "getCard", 403, refusal)).toEqual({
      valid: true,
      errors: [],
    });
  });

  test("accepts the gate's refusal on an operation that does not name its status", () => {
    expect(
      validateResponse(bundle, api, "deleteCard", 403, refusal).valid,
    ).toBe(true);
  });

  test("still accepts the operation's own body at that status", () => {
    expect(
      validateResponse(bundle, api, "getCard", 403, {
        error: { code: "NOT_RUN_OWNER", message: "No." },
      }).valid,
    ).toBe(true);
  });

  test("refuses a body neither the operation nor the gate allows, with both reasons", () => {
    const r = validateResponse(bundle, api, "getCard", 403, {
      error: "product_not_enabled",
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.startsWith("as the gate's refusal:"))).toBe(
      true,
    );
  });

  test("the gate answers only at its own status", () => {
    expect(validateResponse(bundle, api, "getCard", 401, refusal).valid).toBe(
      false,
    );
  });

  test("without the gate the flat refusal fails, so the gate is what admits it", () => {
    const plain = bundleWith((doc, cases) => {
      delete doc["x-treaty-gate-refusals"];
      delete cases.gateRefusals;
    });
    expect(
      validateResponse(plain, openApi(plain, DOC), "getCard", 403, refusal)
        .valid,
    ).toBe(false);
  });
});

describe("compareOpenApi: gate refusals", () => {
  const base = {
    openapi: "3.1.0",
    paths: {},
    "x-treaty-gate-refusals": gate(),
  };

  test("a gate added is not breaking", () => {
    expect(compareOpenApi({ openapi: "3.1.0", paths: {} }, base)).toEqual([]);
  });

  test("a gate removed is breaking", () => {
    expect(compareOpenApi(base, { openapi: "3.1.0", paths: {} })).toEqual([
      { pointer: "/x-treaty-gate-refusals/403", rule: "gate-refusal-removed" },
    ]);
  });

  test("a gate's body changed is breaking", () => {
    const head = structuredClone(base);
    head["x-treaty-gate-refusals"]["403"].schema.required = ["error"];
    expect(compareOpenApi(base, head)).toEqual([
      {
        pointer: "/x-treaty-gate-refusals/403/schema/required/org",
        rule: "required-removed",
      },
    ]);
  });
});
