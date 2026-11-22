import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBundle } from "../scripts/bundle.ts";
import { sync, verify } from "../src/verify.ts";

const root = join(import.meta.dir, "../../..");
const CLI = join(import.meta.dir, "../src/cli.ts");
const RECORD = "schemas/superpipeline/record.v1.json";

let work = "";
let dataDir = "";
beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "treaty-verify-"));
  dataDir = join(work, "data");
  buildBundle(root, dataDir, "0.0.15");
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

let n = 0;
/** A fresh product repository holding `manifest`, with `record.v1.json` vendored correctly. */
function repo(manifest: Record<string, unknown>): string {
  const dir = join(work, `repo-${(n += 1)}`);
  mkdirSync(join(dir, "contracts"), { recursive: true });
  copyFileSync(join(root, RECORD), join(dir, "contracts/record.v1.json"));
  writeFileSync(join(dir, "treaty.json"), JSON.stringify(manifest));
  return dir;
}
const clean = {
  product: "superlibrary",
  treaty: "0.0.15",
  produces: [],
  consumes: ["superpipeline.direct-push"],
  vendored: [{ path: "contracts/record.v1.json", source: RECORD }],
};
const codes = (
  manifest: Record<string, unknown>,
  opts: { latest?: string; maxBehind?: number } = {},
  prepare: (dir: string) => void = () => undefined,
) => {
  const dir = repo(manifest);
  prepare(dir);
  return verify({ repoRoot: dir, dataDir, ...opts }).map((p) => p.code);
};

describe("verify", () => {
  test("a clean manifest yields no problems", () => {
    expect(codes(clean)).toEqual([]);
  });

  const cases: [string, Record<string, unknown>, string][] = [
    ["manifest-invalid", { ...clean, product: "nope" }, "an unknown product"],
    [
      "unknown-contract",
      { ...clean, consumes: ["superpipeline.nope"] },
      "an id the registry lacks",
    ],
    [
      "not-owner",
      { ...clean, produces: ["superpipeline.events"] },
      "producing another product's crossing",
    ],
    [
      "not-a-consumer",
      { ...clean, consumes: ["superpipeline.agent-work"] },
      "consuming a crossing the registry does not list it for",
    ],
    [
      "self-consumer",
      {
        ...clean,
        product: "superpipeline",
        consumes: ["superpipeline.events"],
      },
      "consuming its own crossing",
    ],
    [
      "pin-mismatch",
      { ...clean, treaty: "0.0.14" },
      "a pin other than the installed release",
    ],
  ];
  for (const [code, manifest, what] of cases) {
    test(`${code}: ${what}`, () => {
      expect(codes(manifest)).toContain(code);
    });
  }

  test("pin-behind: more releases behind than allowed", () => {
    expect(codes(clean, { latest: "0.0.18", maxBehind: 2 })).toEqual([
      "pin-behind",
    ]);
    expect(codes(clean, { latest: "0.0.17", maxBehind: 2 })).toEqual([]);
  });

  test("vendored-missing: a copy that is not there", () => {
    expect(
      codes(clean, {}, (dir) => rmSync(join(dir, "contracts/record.v1.json"))),
    ).toEqual(["vendored-missing"]);
  });

  test("vendored-drift: a copy that differs only in line endings, with the fix in the message", () => {
    const dir = repo(clean);
    const path = join(dir, "contracts/record.v1.json");
    writeFileSync(path, readFileSync(path, "utf8").replaceAll("\n", "\r\n"));
    const problems = verify({ repoRoot: dir, dataDir });
    expect(problems.map((p) => p.code)).toEqual(["vendored-drift"]);
    expect(problems[0]?.message).toContain("treaty sync");
  });

  test("vendored-unknown-source: a copy of a file the release does not hold", () => {
    expect(
      codes({
        ...clean,
        vendored: [{ path: "x.json", source: "schemas/nope.v1.json" }],
      }),
    ).toEqual(["vendored-unknown-source"]);
  });

  test("a repository with no treaty.json is told so", () => {
    const dir = join(work, "empty");
    mkdirSync(dir, { recursive: true });
    expect(verify({ repoRoot: dir, dataDir }).map((p) => p.code)).toEqual([
      "manifest-missing",
    ]);
  });
});

describe("sync", () => {
  test("sync then verify yields no problems", () => {
    const dir = repo({
      ...clean,
      vendored: [{ path: "vendor/treaty/record.v1.json", source: RECORD }],
    });
    expect(verify({ repoRoot: dir, dataDir }).map((p) => p.code)).toEqual([
      "vendored-missing",
    ]);
    expect(sync({ repoRoot: dir, dataDir })).toEqual([
      "vendor/treaty/record.v1.json",
    ]);
    expect(verify({ repoRoot: dir, dataDir })).toEqual([]);
  });
});

const cli = (args: string[], cwd: string) =>
  spawnSync("bun", [CLI, ...args, "--data", dataDir], {
    cwd,
    encoding: "utf8",
  });

describe("the treaty CLI", () => {
  test("verify exits 0 on a clean repository and 1 with one line per problem", () => {
    expect(cli(["verify"], repo(clean)).status).toBe(0);
    const r = cli(["verify"], repo({ ...clean, treaty: "0.0.14" }));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("pin-mismatch");
  });

  test("cases prints a schema's corpus as JSON", () => {
    const r = cli(
      ["cases", "schemas/superpipeline/gate.pending.v1.json"],
      work,
    );
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(Object.keys(parsed.valid).length).toBeGreaterThan(0);
    expect(parsed.invalid.length).toBeGreaterThan(0);
  });

  test("cases on a schema with none exits 1", () => {
    expect(cli(["cases", "schemas/common/error.v1.json"], work).status).toBe(1);
  });

  test("an unknown command prints usage and exits 2", () => {
    const r = cli(["frobnicate"], work);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage");
  });
});
