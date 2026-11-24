import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkMcpCatalog,
  mcpCatalog,
  unknownTools,
  validateToolArguments,
  validateToolPayload,
  validateToolResult,
} from "../src/mcp.ts";
import { createBundle } from "../src/schemas.ts";

const root = join(import.meta.dir, "../../..");
const META = "schemas/treaty/mcp-catalog.v1.json";
const BASE =
  "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/";
const PATH = "schemas/mcp/sample.v1.json";

const sample = {
  $schema: `${BASE}${META}`,
  $id: `${BASE}${PATH}`,
  catalog: "treaty mcp catalog",
  version: 1,
  server: { name: "sample", path: "/mcp" },
  error: {
    carrier: "text-json",
    schema: {
      type: "object",
      required: ["error"],
      properties: { error: { type: "object", required: ["code"] } },
    },
  },
  tools: [
    {
      name: "list_things",
      scope: null,
      description: "Lists things.",
      inputSchema: { type: "object", properties: {} },
      result: { carrier: "text-json", schema: { $ref: "#/$defs/things" } },
    },
    {
      name: "add_thing",
      scope: "write",
      description: "Adds a thing.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string", minLength: 1 } },
        required: ["name"],
      },
      result: {
        carrier: "structured",
        schema: { type: "object", required: ["id"] },
      },
    },
  ],
  $defs: {
    things: { type: "array", items: { type: "string" } },
  },
};

const cases = {
  tools: {
    list_things: {
      arguments: {
        valid: { none: {} },
        invalid: [{ why: "a list", body: [] }],
      },
      result: {
        valid: { two: ["a", "b"] },
        invalid: [{ why: "numbers", body: [1] }],
      },
    },
    add_thing: {
      arguments: {
        valid: { named: { name: "x" } },
        invalid: [{ why: "unnamed", body: {} }],
      },
    },
  },
  error: {
    valid: { coded: { error: { code: "X" } } },
    invalid: [{ why: "bare", body: {} }],
  },
};

const files = (catalog: unknown, caseFile: unknown = cases) =>
  createBundle({
    [META]: JSON.parse(readFileSync(join(root, META), "utf8")),
    [PATH]: catalog,
    "fixtures/mcp/sample.v1.cases.json": caseFile,
  });
const bundle = files(sample);
const catalog = mcpCatalog(bundle, "sample.v1");
const text = (value: unknown, isError = false) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
});

describe("mcpCatalog", () => {
  test("reads each tool's name and scope", () => {
    expect(catalog.tools.map((t) => [t.name, t.scope])).toEqual([
      ["list_things", null],
      ["add_thing", "write"],
    ]);
    expect(catalog.server).toEqual({ name: "sample", path: "/mcp" });
  });

  test("a name without its version is refused, so a reader never drifts to a newer catalog", () => {
    expect(() => mcpCatalog(bundle, "sample")).toThrow(/version/);
  });

  test("a file that is not a catalog is refused", () => {
    const { tools: _tools, ...rest } = sample;
    expect(() => mcpCatalog(files(rest), "sample.v1")).toThrow(
      /not an MCP catalog/,
    );
  });

  test("unknownTools names what the catalog does not hold", () => {
    expect(
      unknownTools(catalog, ["add_thing", "remove_thing", "remove_thing"]),
    ).toEqual(["remove_thing"]);
  });
});

describe("validateToolArguments", () => {
  test("accepts arguments the input schema holds, and absent arguments for a tool that takes none", () => {
    expect(
      validateToolArguments(bundle, catalog, "add_thing", { name: "x" }).valid,
    ).toBe(true);
    expect(
      validateToolArguments(bundle, catalog, "list_things", undefined).valid,
    ).toBe(true);
  });

  test("refuses arguments the input schema does not hold", () => {
    const r = validateToolArguments(bundle, catalog, "add_thing", { name: "" });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  test("refuses a tool the catalog does not name", () => {
    expect(
      validateToolArguments(bundle, catalog, "remove_thing", {}).errors,
    ).toEqual([`remove_thing is not a tool in ${PATH}`]);
  });
});

describe("validateToolResult", () => {
  test("reads a text-json result, following a $ref into the catalog's $defs", () => {
    expect(
      validateToolResult(bundle, catalog, "list_things", text(["a"])).valid,
    ).toBe(true);
    expect(
      validateToolResult(bundle, catalog, "list_things", text([1])).valid,
    ).toBe(false);
  });

  test("reads a structured result from structuredContent", () => {
    const ok = { content: [], structuredContent: { id: "t1" } };
    expect(validateToolResult(bundle, catalog, "add_thing", ok).valid).toBe(
      true,
    );
    expect(
      validateToolResult(bundle, catalog, "add_thing", text({ id: "t1" }))
        .valid,
    ).toBe(false);
  });

  test("checks a failure against the catalog's error shape", () => {
    expect(
      validateToolResult(
        bundle,
        catalog,
        "add_thing",
        text({ error: { code: "X" } }, true),
      ).valid,
    ).toBe(true);
    expect(
      validateToolResult(
        bundle,
        catalog,
        "add_thing",
        text({ message: "no" }, true),
      ).valid,
    ).toBe(false);
  });

  test("refuses text that is not JSON", () => {
    const r = validateToolResult(bundle, catalog, "list_things", {
      content: [{ type: "text", text: "not json" }],
    });
    expect(r).toEqual({
      valid: false,
      errors: ["the result's text content is not JSON"],
    });
  });

  test("validateToolPayload checks a carried document directly", () => {
    expect(
      validateToolPayload(bundle, catalog, "error", { error: { code: "X" } })
        .valid,
    ).toBe(true);
    expect(validateToolPayload(bundle, catalog, "list_things", "x").valid).toBe(
      false,
    );
  });
});

describe("checkMcpCatalog", () => {
  test("a catalog whose cases all answer as they say has no problems", () => {
    expect(checkMcpCatalog(bundle, PATH)).toEqual([]);
  });

  test("a tool without argument cases is reported", () => {
    const { add_thing: _add, ...rest } = cases.tools;
    expect(
      checkMcpCatalog(files(sample, { ...cases, tools: rest }), PATH),
    ).toEqual(["add_thing has no argument cases"]);
  });

  test("a case the schema answers the other way is reported", () => {
    const wrong = {
      ...cases,
      tools: {
        ...cases.tools,
        add_thing: {
          arguments: {
            valid: { unnamed: {} },
            invalid: [{ why: "named", body: { name: "x" } }],
          },
        },
      },
    };
    expect(checkMcpCatalog(files(sample, wrong), PATH)).toEqual([
      expect.stringContaining("add_thing arguments refuses unnamed: "),
      "add_thing arguments accepts named",
    ]);
  });

  test("a tool listed twice and cases for a tool that does not exist are reported", () => {
    const twice = { ...sample, tools: [...sample.tools, sample.tools[0]] };
    const extra = {
      ...cases,
      tools: { ...cases.tools, ghost: cases.tools.add_thing },
    };
    expect(checkMcpCatalog(files(twice, extra), PATH)).toEqual([
      "list_things is listed twice",
      "fixtures/mcp/sample.v1.cases.json has cases for ghost, which is no tool",
    ]);
  });
});
