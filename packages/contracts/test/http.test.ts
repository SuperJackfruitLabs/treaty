import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  matchRoute,
  openApi,
  validateRequest,
  validateResponse,
} from "../src/http.ts";
import { createBundle, validatorFor } from "../src/schemas.ts";

const root = join(import.meta.dir, "../../..");
const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const SAMPLE = "schemas/http/sample/sample.v1.openapi.json";
const bundle = createBundle({
  "schemas/common/error.v1.json": json(
    join(root, "schemas/common/error.v1.json"),
  ),
  [SAMPLE]: json(join(import.meta.dir, "fixtures/sample.openapi.json")),
});
const api = openApi(bundle, SAMPLE);

describe("operations", () => {
  test("lists every operation with its request and response pointers", () => {
    const ids = api.operations.map((o) => o.id).toSorted();
    expect(ids).toEqual([
      "createCard",
      "deleteCard",
      "getCard",
      "listReadyCards",
    ]);
    const get = api.operations.find((o) => o.id === "getCard");
    expect(get?.errorCodes).toEqual(["NOT_RUN_OWNER"]);
    expect(Object.keys(get?.responses ?? {})).toEqual(["200", "403"]);
  });
});

describe("matchRoute", () => {
  test("matches a path with two parameters", () => {
    expect(matchRoute(api, "GET", "/v1/boards/b1/cards/c1")).toBe("getCard");
  });

  test("prefers a literal segment over a parameter", () => {
    expect(matchRoute(api, "GET", "/v1/boards/b1/cards/ready")).toBe(
      "listReadyCards",
    );
  });

  test("ignores a query string and a trailing slash", () => {
    expect(matchRoute(api, "get", "/v1/boards/b1/cards/c1/?x=1")).toBe(
      "getCard",
    );
  });

  test("returns undefined for an unknown path and for a wrong method", () => {
    expect(matchRoute(api, "GET", "/v1/agents/load")).toBeUndefined();
    expect(matchRoute(api, "PUT", "/v1/boards/b1/cards/c1")).toBeUndefined();
  });
});

describe("validation", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = Object.assign(
      () => {
        throw new Error("validation must not reach the network");
      },
      { preconnect: () => undefined },
    );
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("validateResponse accepts a body that matches", () => {
    const r = validateResponse(bundle, api, "getCard", 200, {
      id: "c1",
      title: "t",
    });
    expect(r).toEqual({ valid: true, errors: [] });
  });

  test("validateResponse resolves a $ref into schemas/common/error.v1.json offline", () => {
    expect(
      validateResponse(bundle, api, "getCard", 403, {
        error: { code: "NOT_RUN_OWNER", message: "x" },
      }).valid,
    ).toBe(true);
    expect(
      validateResponse(bundle, api, "getCard", 403, { error: "nope" }).valid,
    ).toBe(false);
  });

  test("validateRequest refuses a body missing a required field and names the field", () => {
    const r = validateRequest(bundle, api, "createCard", {});
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("title");
  });

  test("a status with no schema accepts only an empty body", () => {
    expect(
      validateResponse(bundle, api, "deleteCard", 204, undefined).valid,
    ).toBe(true);
    expect(
      validateResponse(bundle, api, "deleteCard", 204, { x: 1 }).valid,
    ).toBe(false);
  });

  test("a status the contract does not name is refused", () => {
    const r = validateResponse(bundle, api, "getCard", 418, {});
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain("418");
  });

  test("an operation with no request body refuses one", () => {
    expect(validateRequest(bundle, api, "getCard", { x: 1 }).valid).toBe(false);
    expect(validateRequest(bundle, api, "getCard", undefined).valid).toBe(true);
  });

  test("an unknown operationId throws", () => {
    expect(() => validateRequest(bundle, api, "nope", {})).toThrow("nope");
  });
});

describe("an unreadable contract", () => {
  test("a $ref that resolves nowhere is a refusal, not a throw", () => {
    const broken = createBundle({
      "schemas/x.json": {
        $id: "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/schemas/x.json",
        $ref: "#/nope",
      },
    });
    const r = validatorFor(broken, "schemas/x.json")({});
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain("nope");
  });
});
