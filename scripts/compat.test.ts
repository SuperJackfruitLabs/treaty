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
