import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBundle } from "../packages/contracts/src/node.ts";
import { readRegistry } from "../packages/contracts/src/registry.ts";
import { validatorFor } from "../packages/contracts/src/schemas.ts";

const root = join(import.meta.dir, "..");
const read = (path: string): unknown =>
  JSON.parse(readFileSync(join(root, path), "utf8"));
const bundle = loadBundle(root);
const registry = readRegistry(bundle);
const FILE = "fixtures/superbench-api/cases.json";

interface Cases {
  sources: string[];
  valid: Record<string, unknown>;
  invalid: { why: string; body: unknown }[];
}
function isCases(value: unknown): value is Cases {
  return (
    value !== null &&
    typeof value === "object" &&
    "sources" in value &&
    Array.isArray(value.sources) &&
    "valid" in value &&
    typeof value.valid === "object" &&
    value.valid !== null &&
    "invalid" in value &&
    Array.isArray(value.invalid)
  );
}
function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object"
    ? Reflect.get(value, key)
    : undefined;
}

const doc = read(FILE);
const schemas = field(doc, "schemas");
function casesFor(name: string): Cases | undefined {
  const node = field(schemas, name);
  return isCases(node) ? node : undefined;
}

/** A corpus's named bodies: `valid` as a list of `{ name, body }` or a map of name to body. */
function corpusBodies(path: string): Map<string, unknown> {
  const valid = field(read(path), "valid");
  if (Array.isArray(valid))
    return new Map(
      valid.flatMap((e: unknown) => {
        const name = field(e, "name");
        return typeof name === "string" ? [[name, field(e, "body")]] : [];
      }),
    );
  return new Map(
    valid !== null && typeof valid === "object" ? Object.entries(valid) : [],
  );
}

const crossing = registry.crossings.find(
  (c) => c.id === "superbench.local-api",
);
const contractSchemas = (crossing?.contract ?? []).filter((p) =>
  p.startsWith("schemas/"),
);

describe("superbench.local-api cases", () => {
  test("every schema of the crossing has its cases in the registry", () => {
    expect(contractSchemas.length).toBe(16);
    expect(
      contractSchemas.filter((p) => crossing?.cases?.[p] === undefined),
    ).toEqual([]);
  });

  for (const path of contractSchemas) {
    const location = crossing?.cases?.[path] ?? "";
    const name = path
      .replace(/^schemas\/superbench\//, "")
      .replace(/\.json$/, "");
    // The remote credential's cases were written before this file and stay where they are.
    if (!location.startsWith(`${FILE}#`)) continue;
    const cases = casesFor(name);
    const validate = validatorFor(bundle, path);

    test(`${name}: the registry points at its entry here`, () => {
      expect(location).toBe(`${FILE}#/schemas/${name}`);
      expect(Object.keys(cases?.valid ?? {}).length).toBeGreaterThan(0);
      expect(cases?.invalid.length ?? 0).toBeGreaterThan(0);
    });

    test(`${name}: a case labelled as a corpus entry is that entry`, () => {
      const drift: string[] = [];
      for (const source of cases?.sources ?? []) {
        if (source.startsWith("superbench:")) continue;
        expect(existsSync(join(root, source))).toBe(true);
        const bodies = corpusBodies(source);
        for (const [label, body] of Object.entries(cases?.valid ?? {}))
          if (bodies.has(label) && !Bun.deepEquals(bodies.get(label), body))
            drift.push(`${source}: ${label}`);
      }
      expect(drift).toEqual([]);
    });

    for (const [label, body] of Object.entries(cases?.valid ?? {}))
      test(`${name} accepts ${label}`, () => {
        expect(validate(body).errors).toEqual([]);
      });
    for (const { why, body } of cases?.invalid ?? [])
      test(`${name} refuses: ${why}`, () => {
        expect(validate(body).valid).toBe(false);
      });
  }

  test("POST /v2/registrations/observe: the cases carry the private execution corpus's request and reply", () => {
    const io = read("fixtures/superbench-api/private-execution-io.json");
    expect(
      casesFor("registration-observe-operation.v2")?.valid[
        "observe-grouped-registration"
      ],
    ).toEqual(field(io, "observation_request"));
    expect(
      casesFor("registration-observe-response.v2")?.valid[
        "observed-grouped-registration"
      ],
    ).toEqual(field(io, "observation_response"));
  });
});
