import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SRC_CLEAN, isSource, judge, type Finding } from "./lint.mjs";

const at = (code: string, filename: string): Finding => ({
  code,
  filename,
  message: "m",
});
const run = (
  findings: Finding[],
  baseline: Record<string, number>,
  lock = false,
) => judge(findings, baseline, { lock });
const HELD = "typescript(no-non-null-assertion)";

describe("the lint ratchet", () => {
  test("holds a count at the baseline", () => {
    expect(run([at(HELD, "packages/a/src/x.ts")], { [HELD]: 1 }).code).toBe(0);
  });

  test("fails when a count rises, and --update refuses to raise it", () => {
    const findings = [
      at(HELD, "packages/a/src/x.ts"),
      at(HELD, "scripts/y.ts"),
    ];
    expect(run(findings, { [HELD]: 1 }).code).toBe(1);
    const locked = run(findings, { [HELD]: 1 }, true);
    expect(locked.code).toBe(1);
    expect(locked.next).toBeUndefined();
  });

  test("fails on a rule the baseline does not hold", () => {
    expect(run([at("eslint(no-debugger)", "scripts/y.ts")], {}).code).toBe(1);
  });

  test("fails when a count falls until --update locks it in", () => {
    expect(run([], { [HELD]: 1 }).code).toBe(1);
    const locked = run([at(HELD, "packages/a/src/x.ts")], { [HELD]: 2 }, true);
    expect(locked.code).toBe(0);
    expect(locked.next).toEqual({ [HELD]: 1 });
    // A rule that reaches zero leaves the baseline.
    expect(run([], { [HELD]: 1 }, true).next).toEqual({});
  });

  test("keeps shipped source clean of SRC_CLEAN rules whatever the baseline allows", () => {
    const rule = "typescript(await-thenable)";
    expect(SRC_CLEAN.has(rule)).toBe(true);
    expect(run([at(rule, "scripts/y.ts")], { [rule]: 1 }).code).toBe(0);
    expect(run([at(rule, "apps/relay/src/x.ts")], { [rule]: 1 }).code).toBe(1);
  });

  test("a baseline rule with no finding in shipped source must join SRC_CLEAN", () => {
    const rule = "typescript(no-unsafe-type-assertion)";
    expect(SRC_CLEAN.has(rule)).toBe(false);
    const r = run([at(rule, "packages/a/test/x.test.ts")], { [rule]: 1 });
    expect(r.code).toBe(1);
    expect(r.out.join("\n")).toContain("add it to SRC_CLEAN");
  });

  test("shipped source is a package's or an app's src/, tests excluded", () => {
    expect(isSource("packages/outbox/src/sqlite.ts")).toBe(true);
    expect(isSource("apps/relay/src/main.ts")).toBe(true);
    expect(isSource("packages/outbox/test/sqlite.test.ts")).toBe(false);
    expect(isSource("packages/outbox/src/x.test.ts")).toBe(false);
    expect(isSource("scripts/matrix-examples.ts")).toBe(false);
    expect(isSource("deploy/staging/sink.ts")).toBe(false);
  });

  test("the baseline is sorted and every count is positive", () => {
    const baseline: Record<string, number> = JSON.parse(
      readFileSync(join(import.meta.dir, "lint-baseline.json"), "utf8"),
    );
    const rules = Object.keys(baseline);
    expect(rules).toEqual(rules.toSorted((a, b) => a.localeCompare(b)));
    expect(Object.values(baseline).every((n) => n > 0)).toBe(true);
  });

  test("the lint tools are pinned exactly", () => {
    const pkg: { devDependencies: Record<string, string> } = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );
    expect(pkg.devDependencies["oxlint"]).toBe("1.88.0");
    expect(pkg.devDependencies["oxlint-tsgolint"]).toBe("7.0.2004");
  });
});
