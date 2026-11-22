/**
 * Pins the defects a review of the first draft found, so none can come back.
 */
import { describe, expect, test } from "bun:test";
import { casesFor } from "../src/cases.ts";
import { compareOpenApi, compareSchemas } from "../src/compat.ts";
import {
  matchRoute,
  openApi,
  validateRequest,
  validateResponse,
} from "../src/http.ts";
import { checkOpenApi } from "../src/openapi-check.ts";
import { createBundle } from "../src/schemas.ts";
import { parseVersion, releasesBehind } from "../src/verify.ts";

const card = {
  type: "object",
  properties: { id: { type: "string" } },
};
const json = (schema: unknown) => ({
  content: { "application/json": { schema } },
});
const rules = (base: unknown, head: unknown) =>
  compareOpenApi(base, head).map((b) => b.rule);

describe("compareSchemas", () => {
  test("opening a closed object is breaking", () => {
    expect(
      compareSchemas({ ...card, additionalProperties: false }, card).map(
        (b) => b.rule,
      ),
    ).toContain("additional-properties-opened");
  });

  test("unevaluatedProperties: false closes an object too", () => {
    const closed = { ...card, unevaluatedProperties: false };
    const added = {
      ...closed,
      properties: { ...card.properties, x: { type: "string" } },
    };
    expect(compareSchemas(closed, added).map((b) => b.rule)).toContain(
      "property-added-to-closed",
    );
    expect(compareSchemas(card, closed).map((b) => b.rule)).toContain(
      "additional-properties-closed",
    );
  });
});

/** An API with one POST, its request body, one parameter and a $ref'd response. */
function api(edit: {
  bodyRequired?: boolean;
  paramRequired?: boolean;
  response?: unknown;
  operationId?: string;
  pathParams?: unknown[];
}) {
  return {
    openapi: "3.1.0",
    paths: {
      "/v1/cards/{id}": {
        parameters: edit.pathParams ?? [],
        post: {
          ...(edit.operationId === ""
            ? {}
            : { operationId: edit.operationId ?? "update" }),
          parameters: [
            {
              in: "query",
              name: "q",
              required: edit.paramRequired ?? false,
              schema: { type: "string" },
            },
          ],
          requestBody: { $ref: "#/components/requestBodies/Card" },
          responses: { "200": { $ref: "#/components/responses/Card" } },
        },
      },
    },
    components: {
      requestBodies: {
        Card: { required: edit.bodyRequired ?? false, ...json(card) },
      },
      responses: { Card: json(edit.response ?? card) },
    },
  };
}

describe("compareOpenApi", () => {
  test("a request body that becomes required is breaking", () => {
    expect(rules(api({}), api({ bodyRequired: true }))).toContain(
      "request-became-required",
    );
  });

  test("a parameter that becomes required is breaking", () => {
    expect(rules(api({}), api({ paramRequired: true }))).toContain(
      "parameter-became-required",
    );
  });

  test("a change inside a $ref'd response component is seen", () => {
    expect(
      rules(api({}), api({ response: { type: "object", properties: {} } })),
    ).toContain("property-removed");
  });

  test("moving a body inline to a $ref with the same schema is not breaking", () => {
    const head = api({});
    Reflect.set(head.paths["/v1/cards/{id}"].post.responses, "200", json(card));
    expect(rules(api({}), head)).toEqual([]);
  });

  test("an operation without an operationId is still compared, by method and path", () => {
    const base = api({ operationId: "" });
    const head = { ...base, paths: {} };
    expect(rules(base, head)).toContain("operation-removed");
  });

  test("a path-level parameter is compared like an operation's own", () => {
    const p = {
      in: "header",
      name: "x-board",
      required: false,
      schema: { type: "string" },
    };
    expect(rules(api({ pathParams: [p] }), api({ pathParams: [] }))).toContain(
      "parameter-removed",
    );
  });
});

describe("http", () => {
  const path = "schemas/http/superpipeline/cards.v1.openapi.json";
  const bundle = createBundle({ [path]: api({}) });
  const cards = openApi(bundle, path);

  test("a $ref'd response is validated against its schema, not refused as bodyless", () => {
    expect(
      validateResponse(bundle, cards, "update", 200, { id: "c1" }),
    ).toEqual({
      valid: true,
      errors: [],
    });
    expect(
      validateResponse(bundle, cards, "update", 200, { id: 1 }).valid,
    ).toBe(false);
  });

  const files = {
    path: "x",
    operations: [
      {
        id: "file",
        method: "get" as const,
        path: "/files/{name}.json",
        responses: {},
        errorCodes: [],
        requestRequired: false,
      },
      {
        id: "cafe",
        method: "get" as const,
        path: "/caf%C3%A9",
        responses: {},
        errorCodes: [],
        requestRequired: false,
      },
    ],
  };
  test("matchRoute matches a parameter inside a segment", () => {
    expect(matchRoute(files, "GET", "/files/a.json")).toBe("file");
    expect(matchRoute(files, "GET", "/files/a.yaml")).toBeUndefined();
  });
  test("matchRoute compares segments decoded, and ignores a fragment", () => {
    expect(matchRoute(files, "GET", "/café#top")).toBe("cafe");
  });

  test("the meta-check refuses an operation without an operationId", () => {
    const doc = "schemas/http/superpipeline/x.v1.openapi.json";
    const b = createBundle({ [doc]: api({ operationId: "" }) });
    expect(
      checkOpenApi(b, doc, {
        registry: "treaty crossings",
        version: 1,
        crossings: [],
      }).join("\n"),
    ).toContain("POST /v1/cards/{id} has no operationId");
  });
});

describe("versions", () => {
  test("a leading v is accepted", () => {
    expect(releasesBehind("0.0.15", "v0.0.15")).toBe(0);
  });
  test("anything else that is not x.y.z throws, so a check cannot pass by accident", () => {
    for (const bad of ["0.0.x", "0.0.9-rc.1", "", "latest"])
      expect(() => parseVersion(bad)).toThrow();
  });
});

const op = (id: string, path: string) => ({
  id,
  method: "get" as const,
  path,
  responses: {},
  errorCodes: [],
  requestRequired: false,
});

describe("matchRoute ties", () => {
  test("two templates with equal scores: the one whose literal comes first wins, whatever the order", () => {
    const a = op("literalFirst", "/a/{x}/c");
    const b = op("literalLater", "/{y}/b/c");
    expect(matchRoute({ path: "x", operations: [a, b] }, "GET", "/a/b/c")).toBe(
      "literalFirst",
    );
    expect(matchRoute({ path: "x", operations: [b, a] }, "GET", "/a/b/c")).toBe(
      "literalFirst",
    );
  });
});

describe("cases by convention", () => {
  test("a schema no crossing names finds its cases at fixtures/<path>.cases.json", () => {
    const bundle = createBundle({
      "schemas/common/error.v1.json": {},
      "fixtures/common/error.v1.cases.json": { valid: { a: {} }, invalid: [] },
    });
    expect(
      casesFor(bundle, undefined, "schemas/common/error.v1.json")?.valid,
    ).toEqual({ a: {} });
  });
});

describe("an optional request body", () => {
  test("requestBody.required: false accepts no body at all, and still checks one that is sent", () => {
    const path = "schemas/http/superpipeline/opt.v1.openapi.json";
    const bundle = createBundle({
      [path]: {
        openapi: "3.1.0",
        paths: {
          "/v1/cards/{id}/archive": {
            post: {
              operationId: "archive",
              requestBody: {
                required: false,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { comment: { type: "string" } },
                    },
                  },
                },
              },
              responses: { "200": { description: "ok" } },
            },
          },
        },
      },
    });
    const archiveApi = openApi(bundle, path);
    expect(
      validateRequest(bundle, archiveApi, "archive", undefined).valid,
    ).toBe(true);
    expect(
      validateRequest(bundle, archiveApi, "archive", { comment: "done" }).valid,
    ).toBe(true);
    expect(
      validateRequest(bundle, archiveApi, "archive", { comment: 1 }).valid,
    ).toBe(false);
  });

  test("a required body that is missing is refused", () => {
    const path = "schemas/http/superpipeline/req.v1.openapi.json";
    const bundle = createBundle({
      [path]: {
        openapi: "3.1.0",
        paths: {
          "/v1/x": {
            post: {
              operationId: "x",
              requestBody: {
                required: true,
                content: { "application/json": { schema: { type: "object" } } },
              },
              responses: { "200": { description: "ok" } },
            },
          },
        },
      },
    });
    const r = validateRequest(bundle, openApi(bundle, path), "x", undefined);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain("requires a body");
  });
});
