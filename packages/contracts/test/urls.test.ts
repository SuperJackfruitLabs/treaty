import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createBundle } from "../src/schemas.ts";
import { checkUrlShape, urlShape, validateUrl } from "../src/urls.ts";

const root = join(import.meta.dir, "../../..");
const META = "schemas/treaty/url-shape.v1.json";
const BASE =
  "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/";
const PATH = "schemas/urls/sample.v1.json";

const sample = {
  $schema: `${BASE}${META}`,
  $id: `${BASE}${PATH}`,
  shape: "treaty url shape",
  version: 1,
  origins: [{ scheme: "https" }, { scheme: "http", hosts: ["localhost"] }],
  path: "/open",
  query: {
    next: { required: false, schema: { type: "string", pattern: "^/" } },
  },
  fragment: {
    t: { required: true, schema: { type: "string", minLength: 1 } },
    app: { required: false, schema: { const: "1" } },
  },
};
const cases = {
  valid: { plain: "https://example.com/open#t=abc" },
  invalid: [{ why: "no token", body: "https://example.com/open" }],
};
const files = (doc: unknown, caseFile: unknown = cases) =>
  createBundle({
    [META]: JSON.parse(readFileSync(join(root, META), "utf8")),
    [PATH]: doc,
    "fixtures/urls/sample.v1.cases.json": caseFile,
  });
const bundle = files(sample);
const shape = urlShape(bundle, "sample.v1");
const check = (url: string) => validateUrl(bundle, shape, url);

describe("validateUrl", () => {
  test("accepts a URL of the shape, decoding its parameters and ignoring ones it does not name", () => {
    expect(
      check("https://example.com/open?next=%2Fhome&x=1#t=a%2Fb&app=1"),
    ).toEqual({
      valid: true,
      errors: [],
    });
    expect(check("http://localhost:8080/open#t=x").valid).toBe(true);
  });

  test("refuses an origin the shape does not allow", () => {
    expect(check("http://example.com/open#t=x").errors).toEqual([
      "http://example.com is not an origin of schemas/urls/sample.v1.json",
    ]);
  });

  test("refuses another path, a missing or repeated parameter, and a value its schema refuses", () => {
    expect(check("https://example.com/open/#t=x").errors).toEqual([
      'path "/open/" is not "/open"',
    ]);
    expect(check("https://example.com/open?t=x").errors).toEqual([
      "fragment parameter t is required",
    ]);
    expect(check("https://example.com/open#t=x&t=y").errors).toEqual([
      "fragment parameter t appears 2 times",
    ]);
    expect(check("https://example.com/open?next=home#t=x&app=true").valid).toBe(
      false,
    );
  });

  test("refuses credentials in the URL, and text that is no URL", () => {
    expect(check("https://u:p@example.com/open#t=x").valid).toBe(false);
    expect(check("/open#t=x")).toEqual({
      valid: false,
      errors: ["not an absolute URL"],
    });
  });
});

describe("checkUrlShape", () => {
  test("a shape whose cases answer as they say has no problems", () => {
    expect(checkUrlShape(bundle, PATH)).toEqual([]);
  });

  test("a case answered the other way is reported, and so are missing cases", () => {
    const wrong = {
      valid: { "no token": "https://example.com/open" },
      invalid: [],
    };
    expect(checkUrlShape(files(sample, wrong), PATH)).toEqual([
      "no invalid case",
      "refuses no token: fragment parameter t is required",
    ]);
    expect(checkUrlShape(files(sample, {}), PATH)).toEqual([
      "fixtures/urls/sample.v1.cases.json holds no cases",
    ]);
  });

  test("a name without its version is refused", () => {
    expect(() => urlShape(bundle, "sample")).toThrow(/version/);
  });
});
