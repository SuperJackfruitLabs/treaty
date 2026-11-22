/**
 * Checks a product repository against the treaty release it pins: its `treaty.json`, the
 * crossings it claims, and every treaty file it keeps a copy of.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { installedDataDir, loadInstalledBundle, readManifest } from "./node.ts";
import { findCrossing, readRegistry } from "./registry.ts";
import { validatorFor } from "./schemas.ts";

export interface Problem {
  code:
    | "manifest-missing"
    | "manifest-invalid"
    | "unknown-contract"
    | "not-owner"
    | "not-a-consumer"
    | "self-consumer"
    | "pin-mismatch"
    | "pin-behind"
    | "vendored-missing"
    | "vendored-drift"
    | "vendored-unknown-source";
  message: string;
}

export interface ProductManifest {
  product: string;
  treaty: string;
  produces: string[];
  consumes: string[];
  vendored?: { path: string; source: string }[];
}

export interface VerifyOptions {
  repoRoot: string;
  /** The release's data directory; the installed package's by default. */
  dataDir?: string;
  /** The manifest's path, relative to repoRoot. */
  manifestPath?: string;
  /** The latest released version, to check how far behind the pin is. */
  latest?: string;
  /** How many releases behind `latest` a pin may be. Default 2. */
  maxBehind?: number;
}

const MANIFEST_SCHEMA = "schemas/treaty/product-manifest.v1.json";

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

/** How many releases `pin` is behind `latest`; Infinity across a minor or major version. */
export function releasesBehind(pin: string, latest: string): number {
  const [pa = 0, pb = 0, pc = 0] = pin.split(".").map(Number);
  const [la = 0, lb = 0, lc = 0] = latest.split(".").map(Number);
  if (pa !== la || pb !== lb)
    return pa > la || (pa === la && pb > lb) ? 0 : Infinity;
  return Math.max(0, lc - pc);
}

const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

function readProduct(
  opts: VerifyOptions,
): { manifest: unknown } | { problem: Problem } {
  const path = join(opts.repoRoot, opts.manifestPath ?? "treaty.json");
  if (!existsSync(path))
    return {
      problem: {
        code: "manifest-missing",
        message: `${opts.manifestPath ?? "treaty.json"} is missing: a product declares what it produces and consumes there`,
      },
    };
  try {
    return { manifest: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return {
      problem: {
        code: "manifest-invalid",
        message: `treaty.json is not JSON: ${String(error)}`,
      },
    };
  }
}

/** Every problem with a repository's treaty.json and its copies. Empty means it holds. */
export function verify(opts: VerifyOptions): Problem[] {
  const read = readProduct(opts);
  if ("problem" in read) return [read.problem];
  const bundle = loadInstalledBundle(opts.dataDir);
  const release = readManifest(opts.dataDir);

  const checked = validatorFor(bundle, MANIFEST_SCHEMA)(read.manifest);
  if (!checked.valid || !isManifest(read.manifest))
    return [
      {
        code: "manifest-invalid",
        message: `treaty.json does not match ${MANIFEST_SCHEMA}: ${checked.errors[0] ?? "wrong shape"}`,
      },
    ];
  const manifest = read.manifest;
  const registry = readRegistry(bundle);
  const problems: Problem[] = [];

  for (const id of manifest.produces) {
    const crossing = findCrossing(registry, id);
    if (!crossing)
      problems.push({
        code: "unknown-contract",
        message: `produces ${id}, which the registry does not list`,
      });
    else if (crossing.owner !== manifest.product)
      problems.push({
        code: "not-owner",
        message: `produces ${id}, which ${crossing.owner} owns`,
      });
  }
  for (const id of manifest.consumes) {
    const crossing = findCrossing(registry, id);
    if (!crossing)
      problems.push({
        code: "unknown-contract",
        message: `consumes ${id}, which the registry does not list`,
      });
    else if (crossing.owner === manifest.product)
      problems.push({
        code: "self-consumer",
        message: `consumes ${id}, which it owns`,
      });
    else if (!crossing.consumers.some((c) => c === manifest.product))
      problems.push({
        code: "not-a-consumer",
        message: `consumes ${id}, but the registry lists only ${crossing.consumers.join(", ")}: add ${manifest.product} to its consumers in treaty first`,
      });
  }

  if (manifest.treaty !== release.treaty)
    problems.push({
      code: "pin-mismatch",
      message: `treaty.json pins ${manifest.treaty}, but ${release.treaty} is installed`,
    });
  if (opts.latest) {
    const behind = releasesBehind(manifest.treaty, opts.latest);
    const allowed = opts.maxBehind ?? 2;
    if (behind > allowed)
      problems.push({
        code: "pin-behind",
        message: `treaty ${manifest.treaty} is ${behind === Infinity ? "a version" : `${behind} releases`} behind ${opts.latest}; at most ${allowed} allowed`,
      });
  }

  for (const { path, source } of manifest.vendored ?? []) {
    const expected = release.files[source];
    const target = join(opts.repoRoot, path);
    if (expected === undefined)
      problems.push({
        code: "vendored-unknown-source",
        message: `${path} copies ${source}, which treaty ${release.treaty} does not hold`,
      });
    else if (!existsSync(target))
      problems.push({
        code: "vendored-missing",
        message: `${path} (a copy of ${source}) is missing: run treaty sync`,
      });
    else if (sha256(readFileSync(target)) !== expected)
      problems.push({
        code: "vendored-drift",
        message: `${path} differs from ${source} in treaty ${release.treaty}: run treaty sync`,
      });
  }
  return problems;
}

/** Rewrites every vendored copy from the release, byte for byte. Returns the paths written. */
export function sync(opts: VerifyOptions): string[] {
  const read = readProduct(opts);
  if ("problem" in read) throw new Error(read.problem.message);
  if (!isManifest(read.manifest))
    throw new Error("treaty.json is not a product manifest");
  const dataDir = opts.dataDir ?? installedDataDir();
  const release = readManifest(opts.dataDir);
  const written: string[] = [];
  for (const { path, source } of read.manifest.vendored ?? []) {
    if (release.files[source] === undefined)
      throw new Error(`${source} is not in treaty ${release.treaty}`);
    const target = join(opts.repoRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(dataDir, source), target);
    written.push(path);
  }
  return written;
}
