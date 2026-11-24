import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkOpenApi } from "../src/openapi-check.ts";
import type { Registry } from "../src/registry.ts";
import { createBundle } from "../src/schemas.ts";

const root = join(import.meta.dir, "../../..");
const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const DOC = "schemas/http/superpipeline/sample.v1.openapi.json";
const CASES = "fixtures/http/superpipeline/sample.v1.cases.json";
const sampleDoc = json(join(import.meta.dir, "fixtures/sample.openapi.json"));
const sampleCases = json(join(import.meta.dir, "fixtures/sample.cases.json"));

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

type Edit = {
  in: "doc" | "cases";
  path: string[];
  /** The new value; `undefined` deletes, `{ push }` appends to an array. */
  to?: unknown;
  push?: unknown;
};

function apply(target: unknown, edit: Edit): void {
  const keys = [...edit.path];
  const last = keys.pop() ?? "";
  let node = target;
  for (const key of keys) node = Reflect.get(Object(node), key);
  if ("push" in edit) {
    const list: unknown = Reflect.get(Object(node), last);
    if (Array.isArray(list)) list.push(edit.push);
  } else if (edit.to === undefined) Reflect.deleteProperty(Object(node), last);
  else Reflect.set(Object(node), last, edit.to);
}

/** The sample bundle, with an edit applied to a fresh copy of the document or its cases. */
function bundleWith(edit?: Edit) {
  const doc = structuredClone(sampleDoc);
  const cases = structuredClone(sampleCases);
  if (edit) apply(edit.in === "doc" ? doc : cases, edit);
  return createBundle({
    "schemas/common/error.v1.json": json(
      join(root, "schemas/common/error.v1.json"),
    ),
    "contracts/error-codes.json": json(
      join(root, "contracts/error-codes.json"),
    ),
    [DOC]: doc,
    [CASES]: cases,
  });
}
const card = "/v1/boards/{boardId}/cards/{cardId}";
const ok200 = [
  "paths",
  card,
  "get",
  "responses",
  "200",
  "content",
  "application/json",
  "schema",
];
const err403 = [
  "paths",
  card,
  "get",
  "responses",
  "403",
  "content",
  "application/json",
  "schema",
];

/** A Matrix-envelope API with one operation, declaring `envelope`. */
const matrixDoc = (envelope: string) => ({
  openapi: "3.1.0",
  "x-treaty-error-envelope": envelope,
  paths: {
    "/_supermessage/v1/live-activity/tokens": {
      delete: {
        operationId: "removeLiveActivityToken",
        "x-treaty-error-codes": ["M_MISSING_TOKEN", "M_UNKNOWN_TOKEN"],
        responses: {
          "204": { description: "removed" },
          "401": {
            description: "refused",
            content: {
              "application/json": {
                schema: { $ref: "../../common/matrix-error.v1.json" },
              },
            },
          },
        },
      },
    },
  },
});

describe("checkOpenApi", () => {
  test("the sample keeps every rule", () => {
    expect(checkOpenApi(bundleWith(), DOC, registry)).toEqual([]);
  });

  const broken: [string, Edit, string][] = [
    [
      "an OpenAPI version other than 3.1",
      { in: "doc", path: ["openapi"], to: "3.0.3" },
      "not 3.1.x",
    ],
    [
      "a $ref that resolves nowhere",
      { in: "doc", path: ok200, to: { $ref: "#/components/schemas/Nope" } },
      "does not resolve",
    ],
    [
      "an operationId used twice",
      {
        in: "doc",
        path: ["paths", card, "delete", "operationId"],
        to: "getCard",
      },
      "used twice",
    ],
    [
      "an error code nobody registered",
      {
        in: "doc",
        path: ["paths", card, "get", "x-treaty-error-codes"],
        to: ["NO_SUCH_CODE"],
      },
      "NO_SUCH_CODE",
    ],
    [
      "an error response that is not the shared envelope",
      { in: "doc", path: err403, to: { type: "object" } },
      "must be schemas/common/error.v1.json",
    ],
    [
      "a response with no cases",
      { in: "cases", path: ["operations", "getCard"] },
      "getCard 200 has no valid cases",
    ],
    [
      "a request with no invalid cases",
      {
        in: "cases",
        path: ["operations", "createCard", "request", "invalid"],
        to: [],
      },
      "createCard request has no invalid cases",
    ],
    [
      "a valid case the schema refuses",
      {
        in: "cases",
        path: ["operations", "getCard", "responses", "200", "valid", "wrong"],
        to: { id: 1 },
      },
      'valid case "wrong" fails',
    ],
    [
      "an invalid case the schema accepts",
      {
        in: "cases",
        path: ["operations", "createCard", "request", "invalid"],
        push: { why: "fine really", body: { title: "x" } },
      },
      'invalid case "fine really" passes',
    ],
    [
      "an error case the envelope refuses",
      {
        in: "cases",
        path: ["operations", "getCard", "responses", "403"],
        to: {
          valid: { "a bare string": { error: "NOT_RUN_OWNER" } },
          invalid: [],
        },
      },
      'getCard 403: valid case "a bare string" fails',
    ],
    [
      "an invalid error case the envelope accepts",
      {
        in: "cases",
        path: ["operations", "getCard", "responses", "403"],
        to: {
          valid: {
            refused: { error: { code: "NOT_RUN_OWNER", message: "No." } },
          },
          invalid: [
            {
              why: "fine really",
              body: { error: { code: "NOT_RUN_OWNER", message: "No." } },
            },
          ],
        },
      },
      'getCard 403: invalid case "fine really" passes',
    ],
  ];
  for (const [what, edit, expected] of broken) {
    test(`refuses ${what}`, () => {
      const problems = checkOpenApi(bundleWith(edit), DOC, registry);
      expect(problems.join("\n")).toContain(expected);
    });
  }

  test("a flat-error.v1 API passes with flat error responses and its owner's flat codes", () => {
    const accountsDoc = "schemas/http/accounts/sample.v1.openapi.json";
    const doc = {
      openapi: "3.1.0",
      "x-treaty-error-envelope": "flat-error.v1",
      paths: {
        "/api/token/service": {
          post: {
            operationId: "exchangeServiceToken",
            "x-treaty-error-codes": ["invalid_credential"],
            responses: {
              "401": {
                description: "refused",
                content: {
                  "application/json": {
                    schema: { $ref: "../../common/flat-error.v1.json" },
                  },
                },
              },
            },
          },
        },
      },
    };
    const bundle = createBundle({
      "schemas/common/flat-error.v1.json": json(
        join(root, "schemas/common/flat-error.v1.json"),
      ),
      "contracts/error-codes.json": json(
        join(root, "contracts/error-codes.json"),
      ),
      [accountsDoc]: doc,
      ["fixtures/http/accounts/sample.v1.cases.json"]: { operations: {} },
    });
    const [first] = registry.crossings;
    if (!first) throw new Error("the sample registry is empty");
    const reg: Registry = {
      ...registry,
      crossings: [
        {
          ...first,
          id: "accounts.sample",
          owner: "accounts",
          contract: [accountsDoc],
        },
      ],
    };
    expect(checkOpenApi(bundle, accountsDoc, reg)).toEqual([]);
  });

  describe("a matrix-error.v1 API", () => {
    const agentpodDoc = "schemas/http/agentpod/sample.v1.openapi.json";
    const bundleFor = (envelope: string) =>
      createBundle({
        "schemas/common/matrix-error.v1.json": json(
          join(root, "schemas/common/matrix-error.v1.json"),
        ),
        "contracts/error-codes.json": json(
          join(root, "contracts/error-codes.json"),
        ),
        [agentpodDoc]: matrixDoc(envelope),
        ["fixtures/http/agentpod/sample.v1.cases.json"]: { operations: {} },
      });
    const [first] = registry.crossings;
    if (!first) throw new Error("the sample registry is empty");
    const reg: Registry = {
      ...registry,
      crossings: [
        {
          ...first,
          id: "agentpod.sample",
          owner: "agentpod",
          consumers: ["supermessage"],
          contract: [agentpodDoc],
        },
      ],
    };

    test("passes with Matrix error responses and its owner's Matrix codes", () => {
      expect(
        checkOpenApi(bundleFor("matrix-error.v1"), agentpodDoc, reg),
      ).toEqual([]);
    });

    test("fails when the document declares another envelope", () => {
      expect(
        checkOpenApi(bundleFor("error.v1"), agentpodDoc, reg).join("\n"),
      ).toContain("an error response must be schemas/common/error.v1.json");
    });
  });

  test("refuses an error response in another envelope than the document declares", () => {
    const problems = checkOpenApi(
      bundleWith({
        in: "doc",
        path: ["x-treaty-error-envelope"],
        to: "flat-error.v1",
      }),
      DOC,
      registry,
    );
    expect(problems.join("\n")).toContain(
      "an error response must be schemas/common/flat-error.v1.json",
    );
  });

  test("refuses an envelope treaty does not define", () => {
    const problems = checkOpenApi(
      bundleWith({
        in: "doc",
        path: ["x-treaty-error-envelope"],
        to: "problem+json",
      }),
      DOC,
      registry,
    );
    expect(problems.join("\n")).toContain("x-treaty-error-envelope");
  });

  test("refuses a document no http crossing names", () => {
    const problems = checkOpenApi(bundleWith(), DOC, {
      ...registry,
      crossings: [],
    });
    expect(problems.join("\n")).toContain("is not named by an http crossing");
  });

  test("refuses an API whose cases file is missing", () => {
    const bundle = createBundle({ [DOC]: sampleDoc });
    expect(checkOpenApi(bundle, DOC, registry).join("\n")).toContain(
      `${CASES} is missing`,
    );
  });
});
