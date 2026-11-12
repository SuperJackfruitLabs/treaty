#!/usr/bin/env bun
// Type-aware lint with a ratchet (docs/code-quality.md).
//
// oxlint runs with oxlint-tsgolint over packages/, apps/, scripts/ and deploy/. Rules with
// existing findings are counted in scripts/lint-baseline.json: a count may fall but never rise, a
// rule missing from the baseline must be clean, and an improvement must be locked in.
// `bun run lint --update` lowers the baseline after a cleanup and refuses to raise it; a rule that
// reaches zero leaves the baseline and must then stay clean.
//
// Shipped source (a `src/` folder of a package or an app, not a test) must stay clean of every
// rule in SRC_CLEAN, whatever the baseline allows in tests and scripts. A baseline rule with no
// finding in shipped source must be listed there, so a rule that reaches zero in shipped source
// stays at zero.
//
// Prerequisite: `bun install --frozen-lockfile`. Without it the type-aware rules cannot load the
// project and the run reports typescript(tsconfig-error), which the baseline does not allow.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "scripts/lint-baseline.json");
const update = process.argv.includes("--update");
const PATHS = ["packages", "apps", "scripts", "deploy"];

/** Rules shipped source must stay clean of. Add a rule when it reaches zero there; never remove one. */
export const SRC_CLEAN = new Set([
  "eslint(no-shadow)",
  "typescript(await-thenable)",
  "typescript(require-array-sort-compare)",
  "typescript(unbound-method)",
  "unicorn(consistent-function-scoping)",
]);

/** Shipped source: under a `src/` folder of packages/ or apps/, and not a test file. */
export const isSource = (file) =>
  /^(packages|apps)\/[^/]+\/src\//.test(file) &&
  !/(\.test\.|\.spec\.)/.test(file);

const where = (f) => {
  const at = f.labels?.[0]?.span;
  return `${f.filename}${at ? ":" + at.line : ""}`;
};

/**
 * Compares a lint run with the baseline. Returns the lines to print, the exit code and the
 * baseline to write (only when `lock` is set and nothing rose).
 */
export function judge(findings, baseline, { lock = false } = {}) {
  const out = [];
  const counts = {};
  const inSource = {};
  for (const f of findings) {
    counts[f.code] = (counts[f.code] ?? 0) + 1;
    if (isSource(f.filename)) inSource[f.code] = (inSource[f.code] ?? 0) + 1;
  }

  const unclean = findings.filter(
    (f) => SRC_CLEAN.has(f.code) && isSource(f.filename),
  );
  if (unclean.length) {
    for (const f of unclean.slice(0, 40))
      out.push(`${f.code}: ${where(f)}  ${f.message}`);
    out.push(
      `lint: ${unclean.length} findings in shipped source for rules it must keep clean`,
    );
    return { out, code: 1 };
  }

  const raised = Object.entries(counts).filter(
    ([rule, n]) => n > (baseline[rule] ?? 0),
  );
  if (raised.length) {
    for (const [rule, n] of raised) {
      out.push(
        `${rule}: ${n} findings, the baseline allows ${baseline[rule] ?? 0}`,
      );
      for (const f of findings.filter((x) => x.code === rule).slice(0, 20))
        out.push(`  ${where(f)}  ${f.message}`);
    }
    if (lock)
      out.push(
        "lint: --update never raises the baseline; fix the new findings",
      );
    return { out, code: 1 };
  }

  const unlisted = Object.keys(counts).filter(
    (rule) => !inSource[rule] && !SRC_CLEAN.has(rule),
  );
  if (unlisted.length) {
    out.push(
      `lint: ${unlisted.join(", ")} has no finding in shipped source; add it to SRC_CLEAN in scripts/lint.mjs`,
    );
    return { out, code: 1 };
  }

  const lowered = Object.keys(baseline).filter(
    (rule) => (counts[rule] ?? 0) < baseline[rule],
  );
  if (lock) {
    const next = Object.fromEntries(
      Object.entries(counts).toSorted(([a], [b]) => a.localeCompare(b)),
    );
    out.push(
      `lint baseline: ${findings.length} findings across ${Object.keys(next).length} rules`,
    );
    return { out, code: 0, next };
  }
  if (lowered.length) {
    // A stale baseline would let the count creep back up unnoticed.
    out.push(
      `lint: ${lowered.join(", ")} improved; run bun run lint --update to lock it in`,
    );
    return { out, code: 1 };
  }
  out.push(`lint: ok (${findings.length} findings held by the baseline)`);
  return { out, code: 0 };
}

if (import.meta.main) {
  const run = spawnSync(
    join(root, "node_modules/.bin/oxlint"),
    ["--type-aware", "--format", "json", ...PATHS],
    { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  if (run.error) throw run.error;
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    process.stderr.write(run.stderr || run.stdout);
    process.exit(2);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const { out, code, next } = judge(report.diagnostics, baseline, {
    lock: update,
  });
  if (next) writeFileSync(baselinePath, JSON.stringify(next, null, 2) + "\n");
  for (const line of out) (code ? console.error : console.log)(line);
  process.exit(code);
}
