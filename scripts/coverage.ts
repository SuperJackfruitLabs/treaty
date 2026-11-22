/**
 * How much of the suite's traffic is under contract, and where the registry and the products
 * disagree.
 *
 *   bun scripts/coverage.ts [--json] [--latest <version>] <product checkout>...
 *
 * Reads contracts/registry.json and each checkout's treaty.json. A report, not a gate: it exits
 * 0 whatever it finds, until every product declares itself.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadBundle } from "../packages/contracts/src/node.ts";
import {
  coverage,
  readRegistry,
  type Coverage,
  type Registry,
} from "../packages/contracts/src/registry.ts";
import {
  releasesBehind,
  type ProductManifest,
} from "../packages/contracts/src/verify.ts";

export interface Checkout {
  dir: string;
  manifest?: ProductManifest;
}

export interface Disagreement {
  product: string;
  kind:
    | "unlisted-consumer"
    | "undeclared-consumer"
    | "undeclared-producer"
    | "pin-behind";
  /** A crossing id, or the pinned version for pin-behind. */
  id: string;
}

export interface Report {
  coverage: Coverage;
  declared: string[];
  withoutManifest: string[];
  problems: Disagreement[];
}

function isManifest(value: unknown): value is ProductManifest {
  return (
    value !== null &&
    typeof value === "object" &&
    "product" in value &&
    typeof value.product === "string" &&
    "treaty" in value &&
    typeof value.treaty === "string" &&
    "produces" in value &&
    Array.isArray(value.produces) &&
    "consumes" in value &&
    Array.isArray(value.consumes)
  );
}

export function readCheckouts(dirs: string[]): Checkout[] {
  return dirs.map((dir) => {
    const path = join(dir, "treaty.json");
    if (!existsSync(path)) return { dir };
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isManifest(parsed) ? { dir, manifest: parsed } : { dir };
  });
}

export function report(
  registry: Registry,
  checkouts: Checkout[],
  latest?: string,
): Report {
  const problems: Disagreement[] = [];
  const declared: string[] = [];
  const withoutManifest: string[] = [];
  for (const { dir, manifest } of checkouts) {
    if (!manifest) {
      withoutManifest.push(basename(dir));
      continue;
    }
    const product = manifest.product;
    declared.push(product);
    for (const id of manifest.consumes) {
      const crossing = registry.crossings.find((c) => c.id === id);
      if (crossing && !crossing.consumers.some((c) => c === product))
        problems.push({ product, kind: "unlisted-consumer", id });
    }
    for (const crossing of registry.crossings) {
      if (crossing.status === "deprecated") continue;
      if (
        crossing.consumers.some((c) => c === product) &&
        !manifest.consumes.includes(crossing.id)
      )
        problems.push({
          product,
          kind: "undeclared-consumer",
          id: crossing.id,
        });
      if (
        crossing.owner === product &&
        !manifest.produces.includes(crossing.id)
      )
        problems.push({
          product,
          kind: "undeclared-producer",
          id: crossing.id,
        });
    }
    if (latest) {
      let behind: number;
      try {
        behind = releasesBehind(manifest.treaty, latest);
      } catch {
        behind = Infinity; // a pin that is not a version is as far behind as it gets
      }
      if (behind > 2)
        problems.push({ product, kind: "pin-behind", id: manifest.treaty });
    }
  }
  return { coverage: coverage(registry), declared, withoutManifest, problems };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const latest = arg("--latest");
  const dirs = args.filter(
    (a, i) => !a.startsWith("--") && args[i - 1] !== "--latest",
  );
  const registry = readRegistry(loadBundle(join(import.meta.dir, "..")));
  const out = report(registry, readCheckouts(dirs), latest);
  if (args.includes("--json")) {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } else {
    const c = out.coverage;
    process.stdout.write(
      `coverage: ${c.percent}% (${c.byStatus.contracted} of ${c.applicable} crossings contracted; ${c.byStatus.partial} partial, ${c.byStatus.uncontracted} uncontracted)\n`,
    );
    process.stdout.write(
      `products declaring themselves: ${out.declared.length} of ${out.declared.length + out.withoutManifest.length}${out.withoutManifest.length > 0 ? ` (no treaty.json: ${out.withoutManifest.join(", ")})` : ""}\n`,
    );
    for (const p of out.problems)
      process.stdout.write(`${p.kind}  ${p.product}  ${p.id}\n`);
  }
}
