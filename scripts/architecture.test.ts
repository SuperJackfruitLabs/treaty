import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

// The shape of the repository, held by numbers that may only fall (the largest runtime import
// cycle and the files over the size limit) and by an order between its parts read from the real
// imports. See docs/code-quality.md.

const ROOT = join(import.meta.dir, "..");
/** The folders that hold code. schemas/ and fixtures/ are data. */
const CODE = ["packages", "apps", "scripts", "deploy"];
const SIZE_LIMIT = 1000;
const SKIP = new Set(["node_modules", "dist", "corpus", "schemas"]);

/** Files over SIZE_LIMIT and the most lines each may have. Lower these; never raise them. */
const OVERSIZE: Record<string, number> = {};
/** Files in the largest runtime import cycle. Lower it; never raise it. */
const LARGEST_CYCLE = 0;

/**
 * The parts of the repository from the bottom up. A part imports only from a layer below its
 * own, never from its own layer. Read from the imports on 2026-11-13:
 *
 * - the published packages import no other part from their src/ (see the test below); outbox's
 *   tests use cloudevents' `CloudEvent` type, so outbox sits above it;
 * - the relay imports cloudevents;
 * - scripts/ (the corpus builders and repository-wide tests) and deploy/ (the staging sink)
 *   import the packages, and nothing imports them.
 */
export const LAYERS: string[][] = [
  [
    "packages/cloudevents",
    "packages/ecosystem-identity",
    "packages/event-schemas",
    "packages/matrix-events",
  ],
  ["packages/outbox"],
  ["apps/relay"],
  ["scripts", "deploy"],
];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return SKIP.has(name) ? [] : sources(path);
    return /\.(ts|mts|mjs|js)$/.test(name) && !name.endsWith(".d.mts")
      ? [path]
      : [];
  });
}
const codeFiles = (root = ROOT) =>
  CODE.flatMap((d) => sources(join(root, d))).map((f) => relative(root, f));

export interface Import {
  from: string;
  to: string;
  /** Loaded at run time, not only a type (`import type` and `export type` are erased). */
  value: boolean;
}

/** Every relative import in a file's text, resolved against the repository root. */
export function importsOf(from: string, text: string): Import[] {
  const found: Import[] = [];
  const add = (spec: string, value: boolean) =>
    found.push({ from, to: join(dirname(from), spec), value });
  for (const m of text.matchAll(
    /^[ \t]*(?:import|export)\b(\s+type\b)?[^;"'`]*?\bfrom\s*["'](\.{1,2}\/[^"']+)["']/gm,
  ))
    add(m[2] ?? "", !m[1]);
  for (const m of text.matchAll(/^[ \t]*import\s*["'](\.{1,2}\/[^"']+)["']/gm))
    add(m[1] ?? "", true);
  for (const m of text.matchAll(/\bimport\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g))
    add(m[1] ?? "", true);
  return found;
}

export function imports(root = ROOT): Import[] {
  return codeFiles(root).flatMap((f) =>
    importsOf(f, readFileSync(join(root, f), "utf8")),
  );
}

/** The part a file belongs to: `packages/<name>`, `apps/<name>`, or its top-level folder. */
export const partOf = (file: string): string => {
  const [top, name] = file.split("/");
  return top === "packages" || top === "apps"
    ? `${top}/${name}`
    : (top ?? file);
};

/** Strongly connected components with more than one file (Tarjan). */
export function cycles(graph: Map<string, string[]>): string[][] {
  let next = 0;
  const index = new Map<string, number>(),
    low = new Map<string, number>(),
    stack: string[] = [],
    onStack = new Set<string>(),
    found: string[][] = [];
  const visit = (v: string): void => {
    index.set(v, next);
    low.set(v, next++);
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue;
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) ?? 0, low.get(w) ?? 0));
      } else if (onStack.has(w))
        low.set(v, Math.min(low.get(v) ?? 0, index.get(w) ?? 0));
    }
    if (low.get(v) !== index.get(v)) return;
    const component: string[] = [];
    let w: string | undefined;
    do {
      w = stack.pop();
      if (w === undefined) break;
      onStack.delete(w);
      component.push(w);
    } while (w !== v);
    if (component.length > 1) found.push(component.toSorted());
  };
  for (const v of graph.keys()) if (!index.has(v)) visit(v);
  return found;
}

/** The file graph of imports loaded at run time. */
export function runtimeGraph(all: Import[], files: string[]) {
  const graph = new Map<string, string[]>(files.map((f) => [f, []]));
  for (const i of all) if (i.value) graph.get(i.from)?.push(i.to);
  return graph;
}

/** Part edges ('from>to') that do not point to a lower layer. */
export function layerViolations(all: Import[], layers: string[][]): string[] {
  const rank = new Map(
    layers.flatMap((layer, n) => layer.map((p) => [p, n] as const)),
  );
  const bad = new Set<string>();
  for (const i of all) {
    const a = partOf(i.from),
      b = partOf(i.to);
    if (a === b || !rank.has(b)) continue;
    if ((rank.get(a) ?? -1) <= (rank.get(b) ?? Infinity)) bad.add(`${a}>${b}`);
  }
  return [...bad].toSorted();
}

/** Imports from a package's shipped src/ that leave the package: npm would not have the file. */
export function packageEscapes(all: Import[]): string[] {
  return all
    .filter(
      (i) =>
        /^packages\/[^/]+\/src\//.test(i.from) &&
        partOf(i.to) !== partOf(i.from),
    )
    .map((i) => `${i.from} -> ${i.to}`);
}

const at = (from: string, to: string, value = true): Import => ({
  from,
  to,
  value,
});
const lines = (file: string) =>
  readFileSync(join(ROOT, file), "utf8").split("\n").length - 1;

describe("architecture", () => {
  test("no runtime import cycle grows past the recorded size", () => {
    const largest = Math.max(
      0,
      ...cycles(runtimeGraph(imports(), codeFiles())).map((c) => c.length),
    );
    expect(largest, "the largest import cycle grew").toBeLessThanOrEqual(
      LARGEST_CYCLE,
    );
    expect(largest, "the cycle shrank; lower LARGEST_CYCLE to lock it in").toBe(
      LARGEST_CYCLE,
    );
  });

  test("no code file grows past the size limit", () => {
    const sizes = new Map(codeFiles().map((f) => [f, lines(f)]));
    const over = [...sizes]
      .filter(([f, n]) => n > (OVERSIZE[f] ?? SIZE_LIMIT))
      .map(
        ([f, n]) =>
          `${f}: ${n} lines, the limit is ${OVERSIZE[f] ?? SIZE_LIMIT}`,
      );
    expect(over).toEqual([]);
    const stale = Object.keys(OVERSIZE).filter(
      (f) => (sizes.get(f) ?? 0) < (OVERSIZE[f] ?? 0),
    );
    expect(
      stale,
      "these files shrank; lower or remove their OVERSIZE entry",
    ).toEqual([]);
  });

  test("every part has a layer", () => {
    const parts = new Set(codeFiles().map(partOf));
    expect([...parts].toSorted()).toEqual(LAYERS.flat().toSorted());
  });

  test("imports point down the layers", () => {
    expect(layerViolations(imports(), LAYERS)).toEqual([]);
  });

  test("a published package's src/ imports nothing outside the package", () => {
    expect(packageEscapes(imports())).toEqual([]);
  });

  test("the rules see what they should", () => {
    const text = [
      'import { a } from "./a.ts";',
      'import type { B } from "../b/b.ts";',
      'export type { C } from "./c.ts";',
      'export { d } from "./d.ts";',
      'import "./e.ts";',
      'const f = await import("./f.ts");',
      'import { g } from "node:fs";',
    ].join("\n");
    expect(importsOf("packages/x/src/m.ts", text)).toEqual([
      { from: "packages/x/src/m.ts", to: "packages/x/src/a.ts", value: true },
      { from: "packages/x/src/m.ts", to: "packages/x/b/b.ts", value: false },
      { from: "packages/x/src/m.ts", to: "packages/x/src/c.ts", value: false },
      { from: "packages/x/src/m.ts", to: "packages/x/src/d.ts", value: true },
      { from: "packages/x/src/m.ts", to: "packages/x/src/e.ts", value: true },
      { from: "packages/x/src/m.ts", to: "packages/x/src/f.ts", value: true },
    ]);
    const graph = new Map([
      ["a.ts", ["b.ts"]],
      ["b.ts", ["c.ts"]],
      ["c.ts", ["a.ts"]],
      ["d.ts", ["a.ts"]],
    ]);
    expect(cycles(graph)).toEqual([["a.ts", "b.ts", "c.ts"]]);
    expect([
      ...runtimeGraph(
        [at("a.ts", "b.ts"), at("b.ts", "a.ts", false)],
        ["a.ts", "b.ts"],
      ),
    ]).toEqual([
      ["a.ts", ["b.ts"]],
      ["b.ts", []],
    ]);
    const edges = [
      at("apps/relay/src/x.ts", "packages/cloudevents/src/index.ts"),
      at("packages/cloudevents/src/y.ts", "apps/relay/src/x.ts"),
      at("packages/outbox/src/z.ts", "packages/cloudevents/src/index.ts"),
      at("scripts/s.ts", "deploy/d.ts"),
    ];
    expect(layerViolations(edges, LAYERS)).toEqual([
      "packages/cloudevents>apps/relay",
      "scripts>deploy",
    ]);
    expect(packageEscapes(edges)).toEqual([
      "packages/cloudevents/src/y.ts -> apps/relay/src/x.ts",
      "packages/outbox/src/z.ts -> packages/cloudevents/src/index.ts",
    ]);
    expect(partOf("scripts/matrix-examples/built.ts")).toBe("scripts");
  });
});
