import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadBundle } from "../packages/contracts/src/node.ts";
import { readRegistry } from "../packages/contracts/src/registry.ts";
import { validatorFor } from "../packages/contracts/src/schemas.ts";

const root = join(import.meta.dir, "..");
const RAW = "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/";
const bundle = loadBundle(root);
const registry = readRegistry(bundle);

interface Cases {
  valid: Record<string, unknown>;
  invalid: { why: string; body: unknown }[];
}
function isCases(value: unknown): value is Cases {
  if (value === null || typeof value !== "object") return false;
  if (!("valid" in value) || !("invalid" in value)) return false;
  return (
    typeof value.valid === "object" &&
    value.valid !== null &&
    Array.isArray(value.invalid)
  );
}

/** Follows `file#/pointer` to the cases it names. */
function casesAt(location: string): Cases | undefined {
  const [file = "", pointer = ""] = location.split("#");
  const node = pointer
    .split("/")
    .slice(1)
    .reduce<unknown>(
      (n, key) =>
        n !== null && typeof n === "object" ? Reflect.get(n, key) : undefined,
      JSON.parse(readFileSync(join(root, file), "utf8")),
    );
  return isCases(node) ? node : undefined;
}

const files = readdirSync(join(root, "schemas/agentpod"))
  .filter((f) => f.endsWith(".json"))
  .toSorted();
const casesFor = new Map(
  registry.crossings.flatMap((c) => Object.entries(c.cases ?? {})),
);

describe("schemas/agentpod", () => {
  test("every schema is named by a crossing, with its cases", () => {
    const named = new Set(registry.crossings.flatMap((c) => c.contract));
    expect(
      files
        .map((f) => `schemas/agentpod/${f}`)
        .filter((p) => !named.has(p) || !casesFor.has(p)),
    ).toEqual([]);
  });

  for (const file of files) {
    const path = `schemas/agentpod/${file}`;
    const schema: unknown = bundle.files.get(path);
    const location = casesFor.get(path) ?? "";
    const cases = casesAt(location);
    const validate = validatorFor(bundle, path);

    test(`${file}: its $id is where it is published`, () => {
      expect(
        schema !== null && typeof schema === "object"
          ? Reflect.get(schema, "$id")
          : undefined,
      ).toBe(`${RAW}${path}`);
    });

    test(`${file}: has valid and invalid cases`, () => {
      expect(Object.keys(cases?.valid ?? {}).length).toBeGreaterThan(0);
      expect(cases?.invalid.length ?? 0).toBeGreaterThan(0);
    });

    for (const [label, body] of Object.entries(cases?.valid ?? {})) {
      test(`${file} accepts ${label}`, () => {
        expect(validate(body).errors).toEqual([]);
      });
    }
    for (const { why, body } of cases?.invalid ?? []) {
      test(`${file} refuses: ${why}`, () => {
        expect(validate(body).valid).toBe(false);
      });
    }
  }
});

describe("fixtures/agentpod-live-activity", () => {
  test("the v2 fixture's thinking row carries no counts, as the hub emits it", () => {
    const fleet = casesAt(
      "fixtures/agentpod-live-activity/examples.json#/schemas/fleet-content-state.v1",
    );
    const v2: unknown =
      fleet?.valid[
        "fleet-content-state-v2.json, AgentPod's v2 fixture with the shape the hub emits"
      ];
    const agents: unknown =
      v2 !== null && typeof v2 === "object"
        ? Reflect.get(v2, "agents")
        : undefined;
    const kai: unknown = Array.isArray(agents) ? agents[1] : undefined;
    expect(kai).toEqual({
      roomId: "!kai:hs",
      mxid: "@agent_coder-kai:hs",
      name: "Coder Kai",
      state: "working",
      phase: "thinking",
      step: "Thinking",
      since: 1790670060,
    });
  });
});
