#!/usr/bin/env node
/**
 * treaty: checks a repository against the treaty release it pins.
 *
 *   treaty verify [--manifest treaty.json] [--latest <version>] [--max-behind <n>]
 *   treaty sync   [--manifest treaty.json]
 *   treaty cases  <schema path> [--operation <id> --part request|<status>]
 *   treaty cases  <contract path> --at <JSON pointer>   (MCP catalogs, telemetry, URL shapes)
 *
 * Every command takes --data <dir> to read a release other than the installed one.
 */
import { casesFor, isCases, resolvePointer } from "./cases.ts";
import { loadInstalledBundle } from "./node.ts";
import { casesPathFor } from "./openapi-check.ts";
import { readRegistry } from "./registry.ts";
import { parseVersion, sync, verify, type VerifyOptions } from "./verify.ts";

const USAGE = `usage:
  treaty verify [--manifest treaty.json] [--latest <version>] [--max-behind <n>]
  treaty sync   [--manifest treaty.json]
  treaty cases  <schema path> [--operation <id> --part request|<status>]
  treaty cases  <contract path> --at <JSON pointer>
`;

/** Bad input: printed with the usage, and the command exits 2. */
class UsageError extends Error {}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith("--"))
    throw new UsageError(`${name} needs a value`);
  return value;
}

function wholeNumber(text: string): number {
  if (!/^\d+$/.test(text))
    throw new UsageError(
      `--max-behind must be a whole number, not ${JSON.stringify(text)}`,
    );
  return Number(text);
}

function options(args: string[]): VerifyOptions {
  const data = flag(args, "--data");
  const manifest = flag(args, "--manifest");
  const latest = flag(args, "--latest");
  if (latest) {
    try {
      parseVersion(latest);
    } catch (error) {
      throw new UsageError(
        String(error instanceof Error ? error.message : error),
      );
    }
  }
  const maxBehind = flag(args, "--max-behind");
  return {
    repoRoot: process.cwd(),
    ...(data ? { dataDir: data } : {}),
    ...(manifest ? { manifestPath: manifest } : {}),
    ...(latest ? { latest } : {}),
    ...(maxBehind ? { maxBehind: wholeNumber(maxBehind) } : {}),
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
  const at = flag(args, "--at");
  let found: unknown;
  if (at !== undefined) {
    // The cases file beside a contract, by convention: schemas/x/y.v1.json → fixtures/x/y.v1.cases.json.
    const file = path.endsWith(".openapi.json")
      ? casesPathFor(path)
      : path
          .replace(/^schemas\//, "fixtures/")
          .replace(/\.json$/, ".cases.json");
    found = resolvePointer(bundle.files.get(file), at);
  } else if (operation) {
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

function run(args: string[]): number {
  try {
    return main(args);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`treaty: ${error.message}\n${USAGE}`);
      return 2;
    }
    process.stderr.write(
      `treaty: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

process.exitCode = run(process.argv.slice(2));
