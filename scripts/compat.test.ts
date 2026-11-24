import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createBundle } from "../packages/contracts/src/schemas.ts";
import { compare, judge } from "./compat.ts";

const SCRIPT = join(import.meta.dir, "compat.ts");
const SCHEMA = "schemas/superpipeline/thing.v1.json";
const thing = (extra: Record<string, unknown> = {}, path = SCHEMA) => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/${path}`,
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
  ...extra,
});

let repo = "";
const write = (path: string, value: unknown) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), `${JSON.stringify(value, null, 2)}\n`);
};
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" });
const run = () =>
  spawnSync("bun", [SCRIPT, "--base", "HEAD", "--root", repo], {
    encoding: "utf8",
  });

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "treaty-compat-"));
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  write(SCHEMA, thing());
  write("contracts/compat-exceptions.json", { exceptions: [] });
  git("add", "-A");
  git("commit", "-q", "-m", "base");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("scripts/compat.ts", () => {
  test("an unchanged tree passes", () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("0 breaking");
  });

  test("an in-place breaking edit fails, naming the pointer and the rule", () => {
    write(SCHEMA, thing({ properties: { id: { type: "integer" } } }));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(`${SCHEMA}#/properties/id  type-changed`);
  });

  test("a new version beside the old one passes", () => {
    const v2 = SCHEMA.replace(".v1.", ".v2.");
    write(v2, thing({ required: [] }, v2));
    expect(run().status).toBe(0);
  });

  test("a v2 copied with v1's $id does not crash the check", () => {
    write(SCHEMA.replace(".v1.", ".v2."), thing({ required: [] }));
    const r = run();
    expect(r.stderr).not.toContain("Duplicate schema URI");
    expect(r.status).toBe(0);
  });

  test("removing a schema fails", () => {
    rmSync(join(repo, SCHEMA));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("schema-removed");
  });

  test("an exception lets a named breaking change through", () => {
    write(SCHEMA, thing({ properties: { id: { type: "integer" } } }));
    write("contracts/compat-exceptions.json", {
      exceptions: [{ path: SCHEMA, rule: "type-changed", reason: "test" }],
    });
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("excused");
  });

  test("an exception that matches no change fails as stale", () => {
    write("contracts/compat-exceptions.json", {
      exceptions: [{ path: SCHEMA, reason: "left behind" }],
    });
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("stale");
  });
});

const registry = (cases: string) => ({
  registry: "treaty crossings",
  version: 1,
  crossings: [
    {
      id: "superpipeline.thing",
      title: "t",
      owner: "superpipeline",
      consumers: ["agentpod"],
      kind: "event",
      status: "contracted",
      contract: [SCHEMA, cases],
      cases: { [SCHEMA]: `${cases}#` },
      evidence: ["superpipeline:x"],
    },
  ],
});

describe("the corpus rule", () => {
  const CASES = "fixtures/thing.json";

  test("a constraint that refuses an old valid case is caught even where the structure looks fine", () => {
    // `pattern` is a constraint, so the structural rules catch it too; the corpus rule names the
    // case that would now be refused.
    const base = createBundle({
      [SCHEMA]: thing(),
      [CASES]: { valid: { "a long id": { id: "abcdef" } }, invalid: [] },
      "contracts/registry.json": registry(CASES),
    });
    const head = createBundle({
      [SCHEMA]: thing({
        properties: { id: { type: "string", maxLength: 3 } },
      }),
      [CASES]: { valid: { short: { id: "abc" } }, invalid: [] },
      "contracts/registry.json": registry(CASES),
    });
    const rules = compare(base, head).map((f) => f.rule);
    expect(rules).toContain("old-case-refused: a long id");
  });

  test("judge separates breaking, excused and stale", () => {
    const f = { path: "a", pointer: "", rule: "type-changed" };
    const g = { path: "b", pointer: "", rule: "old-case-refused: x" };
    const out = judge(
      [f, g],
      [
        { path: "b", rule: "old-case-refused", reason: "r" },
        { path: "c", reason: "r" },
      ],
    );
    expect(out.breaking).toEqual([f]);
    expect(out.excused).toEqual([g]);
    expect(out.stale.map((e) => e.path)).toEqual(["c"]);
  });
});

describe("the catalogue", () => {
  const event = {
    type: "com.superjackfruit.superpipeline.thing.done.v1",
    dataschema: "x",
  };
  test("removing an event from schemas/catalog.json is breaking", () => {
    const base = createBundle({ "schemas/catalog.json": { events: [event] } });
    const head = createBundle({ "schemas/catalog.json": { events: [] } });
    expect(compare(base, head).map((f) => f.rule)).toEqual([
      "catalog-event-removed: com.superjackfruit.superpipeline.thing.done.v1",
    ]);
  });

  test("adding an event is not", () => {
    const base = createBundle({ "schemas/catalog.json": { events: [] } });
    const head = createBundle({ "schemas/catalog.json": { events: [event] } });
    expect(compare(base, head)).toEqual([]);
  });
});

describe("hardening", () => {
  test("a schema without $schema is still compared", () => {
    const bare = "schemas/superpipeline/bare.v1.json";
    write(bare, { type: "object", required: ["id"] });
    git("add", "-A");
    git("commit", "-q", "-m", "bare");
    write(bare, { type: "object", required: [] });
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("required-removed");
  });

  test("a schema whose path is not ASCII is still compared", () => {
    const odd = "schemas/superpipeline/café.v1.json";
    write(odd, thing({}, odd));
    git("add", "-A");
    git("commit", "-q", "-m", "odd");
    rmSync(join(repo, odd));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("schema-removed");
  });

  test("a base that is not a commit fails with a clear message, not a stack trace", () => {
    const r = spawnSync(
      "bun",
      [SCRIPT, "--base", "--output=/tmp/x", "--root", repo],
      {
        encoding: "utf8",
      },
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("not a commit");
    expect(r.stderr).not.toContain("    at ");
  });
});

const runDefault = () =>
  spawnSync("bun", [SCRIPT, "--root", repo], { encoding: "utf8" });

describe("the default base is the latest release", () => {
  test("a change made after the release, then changed again before the next one, is not breaking", () => {
    git("tag", "v0.0.1");
    // An unreleased schema lands, then changes in place: nothing could have pinned it.
    const fresh = "schemas/superpipeline/fresh.v1.json";
    write(fresh, thing({}, fresh));
    git("add", "-A");
    git("commit", "-q", "-m", "unreleased");
    write(fresh, thing({ required: [] }, fresh));
    git("add", "-A");
    git("commit", "-q", "-m", "unreleased, changed");
    const r = runDefault();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("against v0.0.1");
  });

  test("a change to what the release holds is breaking", () => {
    git("tag", "v0.0.1");
    write(SCHEMA, thing({ properties: { id: { type: "integer" } } }));
    git("add", "-A");
    git("commit", "-q", "-m", "break a released schema");
    const r = runDefault();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("type-changed");
  });
});

describe("an exception scoped to a release", () => {
  test("excuses a change against that release, and stops applying against the next", () => {
    git("tag", "v0.0.1");
    write(SCHEMA, thing({ properties: { id: { type: "integer" } } }));
    write("contracts/compat-exceptions.json", {
      exceptions: [
        {
          path: SCHEMA,
          rule: "type-changed",
          reason: "test",
          against: "v0.0.1",
        },
      ],
    });
    git("add", "-A");
    git("commit", "-q", "-m", "a recorded break");
    const excused = spawnSync("bun", [SCRIPT, "--root", repo], {
      encoding: "utf8",
    });
    expect(excused.status).toBe(0);
    expect(excused.stdout).toContain("excused");

    git("tag", "v0.0.2");
    const later = spawnSync("bun", [SCRIPT, "--root", repo], {
      encoding: "utf8",
    });
    expect(later.status).toBe(0);
    expect(later.stdout).toContain("expired");
  });
});

/** One tool of a sample catalog. */
const tool = (name: string, input: Record<string, unknown> = {}) => ({
  name,
  scope: "run",
  description: name,
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    ...input,
  },
  result: { carrier: "text-json", schema: { type: "object" } },
});

describe("an MCP catalog", () => {
  const PATH = "schemas/mcp/sample.v1.json";
  const RAW =
    "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/";
  const catalog = (tools: unknown[]) => ({
    $schema: `${RAW}schemas/treaty/mcp-catalog.v1.json`,
    $id: `${RAW}${PATH}`,
    catalog: "treaty mcp catalog",
    version: 1,
    server: { name: "sample" },
    tools,
  });
  const cases = {
    tools: {
      a: { arguments: { valid: { "an id": { id: "x" } }, invalid: [] } },
    },
  };
  const bundle = (tools: unknown[]) =>
    createBundle({
      [PATH]: catalog(tools),
      "fixtures/mcp/sample.v1.cases.json": cases,
    });

  test("a tool added is no finding", () => {
    expect(
      compare(bundle([tool("a")]), bundle([tool("a"), tool("b")])),
    ).toEqual([]);
  });

  test("a tool removed, a scope changed and a required argument added are breaking, named by tool", () => {
    const head = bundle([
      { ...tool("a", { required: ["id"] }), scope: "claim" },
    ]);
    expect(compare(bundle([tool("a"), tool("b")]), head)).toEqual([
      { path: PATH, pointer: "/tools/a/scope", rule: "scope-changed" },
      {
        path: PATH,
        pointer: "/tools/a/inputSchema/required/id",
        rule: "required-added",
      },
      { path: PATH, pointer: "/tools/b", rule: "tool-removed" },
    ]);
  });

  test("an old argument case the new input schema refuses is breaking", () => {
    const head = bundle([
      tool("a", { properties: { id: { type: "string", maxLength: 0 } } }),
    ]);
    expect(compare(bundle([tool("a")]), head).map((f) => f.rule)).toContain(
      "old-case-refused a arguments: an id",
    );
  });
});

describe("telemetry conventions", () => {
  const PATH = "schemas/telemetry/sample.v1.json";
  const RAW =
    "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/";
  const doc = (extra: Record<string, unknown> = {}) => ({
    $schema: `${RAW}schemas/treaty/telemetry-conventions.v1.json`,
    $id: `${RAW}${PATH}`,
    conventions: "treaty telemetry conventions",
    version: 1,
    attributes: {
      "run.id": { type: "string", description: "r" },
      "acp.seq_from": { type: "int", description: "s" },
    },
    spans: {
      attempt: {
        description: "a",
        producers: ["agentpod"],
        required: ["run.id"],
      },
    },
    ...extra,
  });
  const one = (d: unknown) => createBundle({ [PATH]: d });

  test("an attribute or a span added is no finding", () => {
    const head = doc({
      attributes: {
        ...doc().attributes,
        "card.id": { type: "string", description: "c" },
      },
      spans: {
        ...doc().spans,
        turn: {
          description: "t",
          producers: ["agentpod"],
          required: ["run.id"],
        },
      },
    });
    expect(compare(one(doc()), one(head))).toEqual([]);
  });

  test("a type changed, a key made required and a span removed are breaking", () => {
    const head = doc({
      attributes: {
        ...doc().attributes,
        "run.id": { type: "int", description: "r" },
      },
      spans: {},
      logs: {},
    });
    const base = doc({
      logs: {
        "run route": {
          description: "l",
          producers: ["superpipeline"],
          required: [],
        },
      },
    });
    const headLogs = doc({
      attributes: head.attributes,
      spans: {},
      logs: {
        "run route": {
          description: "l",
          producers: ["superpipeline"],
          required: ["run.id"],
        },
      },
    });
    expect(compare(one(base), one(headLogs))).toEqual([
      { path: PATH, pointer: "/attributes/run.id", rule: "type-changed" },
      { path: PATH, pointer: "/spans/attempt", rule: "record-removed" },
      {
        path: PATH,
        pointer: "/logs/run route/required/run.id",
        rule: "required-added",
      },
    ]);
  });
});
