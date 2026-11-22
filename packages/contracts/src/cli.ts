#!/usr/bin/env node
/**
 * treaty: checks a repository against the treaty release it pins.
 *
 *   treaty verify [--manifest treaty.json] [--latest <version>] [--max-behind <n>]
 *   treaty sync   [--manifest treaty.json]
 *   treaty cases  <schema path> [--operation <id> --part request|<status>]
 *
 * Every command takes --data <dir> to read a release other than the installed one.
 */
import { casesFor, isCases, resolvePointer } from "./cases.ts";
import { loadInstalledBundle } from "./node.ts";
import { casesPathFor } from "./openapi-check.ts";
import { readRegistry } from "./registry.ts";
import { sync, verify, type VerifyOptions } from "./verify.ts";

const USAGE = `usage:
  treaty verify [--manifest treaty.json] [--latest <version>] [--max-behind <n>]
  treaty sync   [--manifest treaty.json]
  treaty cases  <schema path> [--operation <id> --part request|<status>]
`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

function options(args: string[]): VerifyOptions {
  const data = flag(args, "--data");
  const manifest = flag(args, "--manifest");
  const latest = flag(args, "--latest");
  const maxBehind = flag(args, "--max-behind");
  return {
    repoRoot: process.cwd(),
    ...(data ? { dataDir: data } : {}),
    ...(manifest ? { manifestPath: manifest } : {}),
    ...(latest ? { latest } : {}),
    ...(maxBehind ? { maxBehind: Number(maxBehind) } : {}),
  };
}

function cases(args: string[]): number {
  const path = args[1];
  if (!path) {
    process.stderr.write(USAGE);
    return 2;
  }
  const data = flag(args, "--data");
  const bundle = loadInstalledBundle(data);
  const operation = flag(args, "--operation");
  let found: unknown;
  if (operation) {
    const part = flag(args, "--part") ?? "request";
    const pointer =
      part === "request"
        ? `/operations/${operation}/request`
        : `/operations/${operation}/responses/${part}`;
    found = resolvePointer(bundle.files.get(casesPathFor(path)), pointer);
  } else found = casesFor(bundle, readRegistry(bundle), path);
  if (!isCases(found)) {
    process.stderr.write(`treaty holds no cases for ${path}\n`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify(found, null, 2)}\n`);
  return 0;
}

export function main(args: string[]): number {
  switch (args[0]) {
    case "verify": {
      const problems = verify(options(args));
      for (const p of problems)
        process.stdout.write(`${p.code}  ${p.message}\n`);
      process.stdout.write(
        problems.length === 0
          ? "treaty verify: ok\n"
          : `treaty verify: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`,
      );
      return problems.length === 0 ? 0 : 1;
    }
    case "sync": {
      for (const path of sync(options(args)))
        process.stdout.write(`wrote ${path}\n`);
      return 0;
    }
    case "cases":
      return cases(args);
    default:
      process.stderr.write(USAGE);
      return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
