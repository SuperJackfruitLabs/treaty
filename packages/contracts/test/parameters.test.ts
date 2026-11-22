import { describe, expect, test } from "bun:test";
import { openApi, routeParams, validateParameters } from "../src/http.ts";
import { createBundle } from "../src/schemas.ts";

const path = "schemas/http/accounts/sample.v1.openapi.json";
const bundle = createBundle({
  [path]: {
    openapi: "3.1.0",
    paths: {
      "/api/principals/{id}/identities/{system}": {
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", pattern: "^prn_[0-9a-f]{20}$" },
          },
        ],
        put: {
          operationId: "putIdentity",
          parameters: [
            { $ref: "#/components/parameters/System" },
            {
              in: "query",
              name: "limit",
              schema: { type: "integer", minimum: 1 },
            },
            {
              in: "query",
              name: "kind",
              required: true,
              schema: { enum: ["human", "agent"] },
            },
            {
              in: "query",
              name: "tag",
              schema: { type: "array", items: { type: "string" } },
            },
            { in: "query", name: "dryRun", schema: { type: "boolean" } },
          ],
          responses: { "200": { description: "ok" } },
        },
      },
    },
    components: {
      parameters: {
        System: {
          in: "path",
          name: "system",
          required: true,
          schema: { enum: ["matrix", "superpipeline"] },
        },
      },
    },
  },
});
const api = openApi(bundle, path);
const prn = "prn_0123456789abcdef0123";

describe("routeParams", () => {
  test("gives the operation and its path values, decoded", () => {
    expect(
      routeParams(
        api,
        "PUT",
        `/api/principals/${prn}/identities/matrix?kind=human`,
      ),
    ).toEqual({
      operationId: "putIdentity",
      path: { id: prn, system: "matrix" },
    });
  });
  test("is undefined when nothing matches", () => {
    expect(routeParams(api, "GET", "/nope")).toBeUndefined();
  });
});

const ok = (values: Parameters<typeof validateParameters>[3]) =>
  validateParameters(bundle, api, "putIdentity", values);

describe("validateParameters", () => {
  test("accepts good path and query values, converting strings to their schema's type", () => {
    expect(
      ok({
        path: { id: prn, system: "matrix" },
        query: { kind: "agent", limit: "5", dryRun: "true", tag: ["a", "b"] },
      }),
    ).toEqual({ valid: true, errors: [] });
  });

  test("checks a path parameter declared on the path item", () => {
    const r = ok({
      path: { id: "prn_nothex", system: "matrix" },
      query: { kind: "agent" },
    });
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("path parameter id");
  });

  test("checks a parameter reached through a $ref", () => {
    expect(
      ok({ path: { id: prn, system: "slack" }, query: { kind: "agent" } })
        .valid,
    ).toBe(false);
  });

  test("refuses a query value that does not convert to its type", () => {
    const r = ok({
      path: { id: prn, system: "matrix" },
      query: { kind: "agent", limit: "five" },
    });
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("query parameter limit");
  });

  test("refuses a missing required parameter, and ignores unknown ones", () => {
    const missing = ok({ path: { id: prn, system: "matrix" }, query: {} });
    expect(missing.valid).toBe(false);
    expect(missing.errors.join("\n")).toContain(
      "query parameter kind is required",
    );
    expect(
      ok({
        path: { id: prn, system: "matrix" },
        query: { kind: "human", other: "x" },
      }).valid,
    ).toBe(true);
  });

  test("a single query value is accepted where the schema wants an array", () => {
    expect(
      ok({
        path: { id: prn, system: "matrix" },
        query: { kind: "human", tag: "one" },
      }).valid,
    ).toBe(true);
  });
});

describe("resolvePointer", () => {
  test("walks through arrays, as JSON pointers do", async () => {
    const { resolvePointer } = await import("../src/cases.ts");
    expect(resolvePointer({ a: [{ b: 1 }, { b: 2 }] }, "/a/1/b")).toBe(2);
  });
});
