import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBundle } from "../scripts/bundle.ts";
import { goModRequirement } from "../src/gomod.ts";
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

const withGoMod =
  (text: string, path = "node-agent/go.mod") =>
  (dir: string) => {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
const goMod = (body: string) =>
  `module example.com/node-agent\n\ngo 1.22\n\n${body}\n`;

describe("a pinned Go module in place of copies", () => {
  const goClean = {
    product: "agentpod",
    treaty: "0.0.15",
    produces: [],
    consumes: [],
    goModules: ["node-agent/go.mod"],
  };
  test("a go.mod requiring the pinned release needs no vendored copies", () => {
    expect(
      codes(
        goClean,
        {},
        withGoMod(
          goMod(
            "require (\n\tgithub.com/SuperJackfruitLabs/treaty v0.0.15 // indirect\n\tgolang.org/x/text v0.14.0\n)",
          ),
        ),
      ),
    ).toEqual([]);
    expect(
      codes(
        goClean,
        {},
        withGoMod(
          goMod("require github.com/SuperJackfruitLabs/treaty v0.0.15"),
        ),
      ),
    ).toEqual([]);
  });

  test("go-module-unpinned: another version, or no requirement", () => {
    expect(
      codes(
        goClean,
        {},
        withGoMod(
          goMod("require github.com/SuperJackfruitLabs/treaty v0.0.14"),
        ),
      ),
    ).toEqual(["go-module-unpinned"]);
    expect(
      codes(goClean, {}, withGoMod(goMod("require golang.org/x/text v0.14.0"))),
    ).toEqual(["go-module-unpinned"]);
    // A commented-out requirement is no requirement.
    expect(
      codes(
        goClean,
        {},
        withGoMod(
          goMod("// require github.com/SuperJackfruitLabs/treaty v0.0.15"),
        ),
      ),
    ).toEqual(["go-module-unpinned"]);
  });

  test("go-module-replaced: a replace reads something other than the release", () => {
    expect(
      codes(
        goClean,
        {},
        withGoMod(
          goMod(
            "require github.com/SuperJackfruitLabs/treaty v0.0.15\nreplace github.com/SuperJackfruitLabs/treaty => ../../treaty",
          ),
        ),
      ),
    ).toEqual(["go-module-replaced"]);
  });

  test("go-module-missing, and a path outside the repository", () => {
    expect(codes(goClean)).toEqual(["go-module-missing"]);
    expect(codes({ ...goClean, goModules: ["../go.mod"] })).toEqual([
      "manifest-invalid",
    ]);
    expect(codes({ ...goClean, goModules: ["node-agent/go.sum"] })).toEqual([
      "manifest-invalid",
    ]);
  });

  test("the go.mod reader", () => {
    expect(
      goModRequirement(
        'require (\n  "github.com/SuperJackfruitLabs/treaty" v0.0.15\n)\nreplace github.com/SuperJackfruitLabs/treaty v0.0.9 => ./x\n',
      ),
    ).toEqual({ version: "v0.0.15" });
    expect(
      goModRequirement(
        "require github.com/SuperJackfruitLabs/treaty v0.0.15\nreplace (\n\tgithub.com/SuperJackfruitLabs/treaty v0.0.15 => ./x\n)\n",
      ),
    ).toEqual({ version: "v0.0.15", replacedBy: "./x" });
    expect(
      goModRequirement(
        "require github.com/SuperJackfruitLabs/treaty/x v0.0.15",
      ),
    ).toEqual({});
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
    expect(cli(["cases", "schemas/treaty/registry.v1.json"], work).status).toBe(
      1,
    );
  });

  test("cases reaches a shared schema's corpus by convention", () => {
    const r = cli(["cases", "schemas/common/error.v1.json"], work);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).invalid.length).toBeGreaterThan(0);
  });

  test("cases --at reaches a pointer in a contract's cases file", () => {
    const r = cli(
      [
        "cases",
        "schemas/mcp/superpipeline.v1.json",
        "--at",
        "/tools/superpipeline_heartbeat/arguments",
      ],
      work,
    );
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).invalid.length).toBeGreaterThan(0);
    const none = cli(
      ["cases", "schemas/mcp/superpipeline.v1.json", "--at", "/tools/ghost"],
      work,
    );
    expect(none.status).toBe(1);
  });

  test("an unknown command prints usage and exits 2", () => {
    const r = cli(["frobnicate"], work);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage");
  });
});

describe("unsafe and odd vendored paths", () => {
  test("a path that climbs out of the repository is refused by verify and by sync", () => {
    const outside = join(work, "outside.json");
    const manifest = {
      ...clean,
      vendored: [{ path: "../outside.json", source: RECORD }],
    };
    const dir = repo(manifest);
    expect(verify({ repoRoot: dir, dataDir }).map((p) => p.code)).toContain(
      "manifest-invalid",
    );
    expect(() => sync({ repoRoot: dir, dataDir })).toThrow();
    expect(existsSync(outside)).toBe(false);
  });

  test("an absolute path is refused", () => {
    expect(
      codes({ ...clean, vendored: [{ path: "/tmp/x.json", source: RECORD }] }),
    ).toContain("manifest-invalid");
  });

  test("a vendored path that is a directory is reported, not a crash", () => {
    expect(
      codes(clean, {}, (dir) => {
        rmSync(join(dir, "contracts/record.v1.json"));
        mkdirSync(join(dir, "contracts/record.v1.json"));
      }),
    ).toEqual(["vendored-not-a-file"]);
  });

  test("a vendored path that is a symlink is refused, so sync cannot write through it", () => {
    expect(
      codes(clean, {}, (dir) => {
        rmSync(join(dir, "contracts/record.v1.json"));
        symlinkSync(join(root, RECORD), join(dir, "contracts/record.v1.json"));
      }),
    ).toEqual(["vendored-not-a-file"]);
  });
});

describe("bad CLI input exits 2 instead of passing", () => {
  test("--latest that is not a version", () => {
    const r = cli(["verify", "--latest", "0.0.x"], repo(clean));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("not a release version");
  });

  test("--latest with a leading v is accepted", () => {
    expect(cli(["verify", "--latest", "v0.0.15"], repo(clean)).status).toBe(0);
  });

  test("--max-behind that is not a whole number", () => {
    expect(
      cli(["verify", "--latest", "0.0.15", "--max-behind", "abc"], repo(clean))
        .status,
    ).toBe(2);
  });

  test("a flag with no value", () => {
    expect(cli(["verify", "--latest"], repo(clean)).status).toBe(2);
    expect(
      cli(["verify", "--latest", "--max-behind", "1"], repo(clean)).status,
    ).toBe(2);
  });
});

describe("a symlinked parent directory", () => {
  test("sync refuses to write through a parent that leads out of the repository", () => {
    const outside = mkdtempSync(join(tmpdir(), "treaty-outside-"));
    const dir = repo({
      ...clean,
      vendored: [{ path: "vend/x.json", source: RECORD }],
    });
    symlinkSync(outside, join(dir, "vend"));
    expect(verify({ repoRoot: dir, dataDir }).map((p) => p.code)).toContain(
      "manifest-invalid",
    );
    expect(() => sync({ repoRoot: dir, dataDir })).toThrow();
    expect(existsSync(join(outside, "x.json"))).toBe(false);
    rmSync(outside, { recursive: true, force: true });
  });
});
