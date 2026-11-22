import { beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBundle } from "../scripts/bundle.ts";
import { loadBundle, loadInstalledBundle } from "../src/node.ts";

const pkg = join(import.meta.dir, "..");
const root = join(pkg, "../..");
const sha = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

let manifest: { treaty: string; files: Record<string, string> };
beforeAll(() => {
  manifest = buildBundle(root, join(pkg, "data"));
});

describe("the contracts bundle", () => {
  test("holds every JSON file under schemas/, fixtures/ and contracts/", () => {
    const fromRepo = [...loadBundle(root).files.keys()].toSorted();
    expect(Object.keys(manifest.files).toSorted()).toEqual(fromRepo);
  });

  test("its manifest hashes match the files it holds", () => {
    const wrong = Object.entries(manifest.files).filter(
      ([path, hash]) => sha(join(pkg, "data", path)) !== hash,
    );
    expect(wrong).toEqual([]);
  });

  test("its manifest records the package version", () => {
    const { version } = JSON.parse(
      readFileSync(join(pkg, "package.json"), "utf8"),
    );
    expect(manifest.treaty).toBe(version);
  });

  test("the installed bundle reads the same as the repository", () => {
    const installed = loadInstalledBundle();
    const repo = loadBundle(root);
    expect([...installed.files.keys()].toSorted()).toEqual(
      [...repo.files.keys()].toSorted(),
    );
    expect(installed.files.get("contracts/registry.json")).toEqual(
      repo.files.get("contracts/registry.json"),
    );
  });
});
