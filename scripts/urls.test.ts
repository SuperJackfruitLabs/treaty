import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadBundle } from "../packages/contracts/src/node.ts";
import { readRegistry } from "../packages/contracts/src/registry.ts";
import { checkUrlShape } from "../packages/contracts/src/urls.ts";

const bundle = loadBundle(join(import.meta.dir, ".."));
const registry = readRegistry(bundle);
const shapes = [...bundle.files.keys()]
  .filter((p) => /^schemas\/urls\/.+\.json$/.test(p))
  .toSorted();

describe("schemas/urls", () => {
  test("the URL shapes are recorded here, so adding one is a visible diff", () => {
    expect(shapes).toEqual([
      "schemas/urls/accounts-matrix-link.v1.json",
      "schemas/urls/supermessage-linked.v1.json",
    ]);
  });

  for (const path of shapes) {
    test(`${path} keeps every rule, and its cases answer as they say`, () => {
      expect(checkUrlShape(bundle, path)).toEqual([]);
    });
  }

  test("every URL shape belongs to a crossing", () => {
    const named = new Set(registry.crossings.flatMap((c) => c.contract));
    expect(shapes.filter((p) => !named.has(p))).toEqual([]);
  });
});
