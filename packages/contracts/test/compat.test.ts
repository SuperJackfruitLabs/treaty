import { describe, expect, test } from "bun:test";
import { compareOpenApi, compareSchemas } from "../src/compat.ts";

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  required,
  properties,
});
const str = { type: "string" };
const rules = (base: unknown, head: unknown) =>
  compareSchemas(base, head).map((b) => `${b.pointer} ${b.rule}`);

const doc = (paths: Record<string, unknown>) => ({
  openapi: "3.1.0",
  paths,
});

const ok = (schema: unknown) => ({
  "200": { content: { "application/json": { schema } } },
});

const at = (node: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>((n, k) => Reflect.get(Object(n), k), node);

const set = (node: unknown, keys: string[], value: unknown) => {
  const last = keys.at(-1) ?? "";
  Reflect.set(Object(at(node, ...keys.slice(0, -1))), last, value);
};

const del = (node: unknown, keys: string[]) => {
  const last = keys.at(-1) ?? "";
  Reflect.deleteProperty(Object(at(node, ...keys.slice(0, -1))), last);
};

const toArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

describe("compareSchemas: what is not breaking", () => {
  test("an unchanged schema yields nothing", () => {
    const s = obj({ id: str }, ["id"]);
    expect(rules(s, structuredClone(s))).toEqual([]);
  });

  test("adding an optional property is not breaking", () => {
    expect(rules(obj({ id: str }), obj({ id: str, name: str }))).toEqual([]);
  });

  test("changing an annotation is not breaking", () => {
    expect(
      rules(
        { ...str, description: "old", title: "a", examples: ["x"] },
        { ...str, description: "new", title: "b", "x-note": 1 },
      ),
    ).toEqual([]);
  });
});

describe("compareSchemas: what is breaking", () => {
  const cases: [string, unknown, unknown, string][] = [
    [
      "a required property added",
      obj({ id: str }),
      obj({ id: str }, ["id"]),
      "/required/id required-added",
    ],
    [
      "a required property dropped",
      obj({ id: str }, ["id"]),
      obj({ id: str }),
      "/required/id required-removed",
    ],
    [
      "a property removed",
      obj({ id: str, name: str }),
      obj({ id: str }),
      "/properties/name property-removed",
    ],
    [
      "a type changed",
      obj({ id: str }),
      obj({ id: { type: "integer" } }),
      "/properties/id type-changed",
    ],
    [
      "a type widened to include null",
      obj({ id: str }),
      obj({ id: { type: ["string", "null"] } }),
      "/properties/id type-changed",
    ],
    [
      "an enum narrowed",
      { enum: ["a", "b"] },
      { enum: ["a"] },
      " enum-narrowed",
    ],
    ["an enum widened", { enum: ["a"] }, { enum: ["a", "b"] }, " enum-widened"],
    ["a const changed", { const: 1 }, { const: 2 }, " const-changed"],
    [
      "additional properties closed",
      obj({ id: str }),
      { ...obj({ id: str }), additionalProperties: false },
      " additional-properties-closed",
    ],
    [
      "a property added where none were allowed",
      { ...obj({ id: str }), additionalProperties: false },
      { ...obj({ id: str, x: str }), additionalProperties: false },
      "/properties/x property-added-to-closed",
    ],
    [
      "a constraint tightened",
      { type: "string", maxLength: 10 },
      { type: "string", maxLength: 5 },
      " constraint-changed:maxLength",
    ],
    [
      "a constraint added",
      str,
      { type: "string", pattern: "^a" },
      " constraint-changed:pattern",
    ],
    [
      "a $ref repointed",
      { $ref: "#/$defs/a" },
      { $ref: "#/$defs/b" },
      " ref-changed",
    ],
    [
      "a composition branch added",
      { oneOf: [str] },
      { oneOf: [str, { type: "integer" }] },
      " composition-changed:oneOf",
    ],
    [
      "a definition removed",
      { $defs: { a: str } },
      { $defs: {} },
      "/$defs/a schema-removed",
    ],
    [
      "a nested change inside items",
      { type: "array", items: obj({ id: str }) },
      { type: "array", items: obj({ id: str }, ["id"]) },
      "/items/required/id required-added",
    ],
    [
      "a nested change inside a definition",
      { $defs: { a: obj({ id: str }) } },
      { $defs: { a: obj({}) } },
      "/$defs/a/properties/id property-removed",
    ],
  ];
  for (const [what, base, head, expected] of cases) {
    test(`${what} is breaking`, () => {
      expect(rules(base, head)).toContain(expected);
    });
  }
});

describe("compareOpenApi", () => {
  const base = doc({
    "/v1/cards/{id}": {
      get: {
        operationId: "getCard",
        parameters: [{ in: "path", name: "id", required: true, schema: str }],
        responses: ok(obj({ id: str }, ["id"])),
      },
    },
  });

  const get = ["paths", "/v1/cards/{id}", "get"];

  test("a new operation and a new status are not breaking", () => {
    const head = structuredClone(base);
    set(head, ["paths", "/v1/cards"], {
      post: { operationId: "createCard", responses: ok(str) },
    });
    set(head, [...get, "responses", "404"], { description: "missing" });
    expect(compareOpenApi(base, head)).toEqual([]);
  });

  const breaking: [string, (head: unknown) => void, string][] = [
    [
      "an operation removed",
      (h) => del(h, ["paths", "/v1/cards/{id}"]),
      "operation-removed",
    ],
    [
      "a path moved",
      (h) => {
        set(h, ["paths", "/v1/card/{id}"], at(h, "paths", "/v1/cards/{id}"));
        del(h, ["paths", "/v1/cards/{id}"]);
      },
      "method-or-path-changed",
    ],
    [
      "a response status removed",
      (h) =>
        set(h, [...get, "responses"], {
          "201": at(h, ...get, "responses", "200"),
        }),
      "response-status-removed",
    ],
    [
      "a response body changed",
      (h) =>
        set(
          h,
          [
            ...get,
            "responses",
            "200",
            "content",
            "application/json",
            "schema",
            "properties",
          ],
          {},
        ),
      "property-removed",
    ],
    [
      "a required query parameter added",
      (h) =>
        set(
          h,
          [...get, "parameters"],
          [
            ...toArray(at(h, ...get, "parameters")),
            { in: "query", name: "x", required: true, schema: str },
          ],
        ),
      "parameter-required-added",
    ],
    [
      "a parameter removed",
      (h) => set(h, [...get, "parameters"], []),
      "parameter-removed",
    ],
  ];
  for (const [what, edit, rule] of breaking) {
    test(`${what} is breaking`, () => {
      const head = structuredClone(base);
      edit(head);
      expect(compareOpenApi(base, head).map((b) => b.rule)).toContain(rule);
    });
  }
});
