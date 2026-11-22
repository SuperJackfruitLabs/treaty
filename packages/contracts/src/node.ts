/**
 * Loading a bundle from disk, for Node and Bun. Workers build one with `createBundle` instead.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBundle, type Bundle } from "./schemas.ts";

const ROOTS = ["schemas", "fixtures", "contracts"] as const;

function walk(root: string, dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(join(root, dir));
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(root, path)).isDirectory() ? walk(root, path) : [path];
  });
}

/** Every `.json` file under schemas/, fixtures/ and contracts/ of `root`. */
export function loadBundle(root: string): Bundle {
  const files = new Map<string, unknown>();
  for (const top of ROOTS) {
    for (const path of walk(root, top)) {
      if (!path.endsWith(".json")) continue;
      files.set(path, JSON.parse(readFileSync(join(root, path), "utf8")));
    }
  }
  return createBundle(files);
}

/** Where this package keeps its copy of treaty's data. */
export function installedDataDir(): string {
  return fileURLToPath(new URL("../data/", import.meta.url));
}

export interface Manifest {
  treaty: string;
  files: Record<string, string>;
}

export function readManifest(dataDir = installedDataDir()): Manifest {
  const parsed: unknown = JSON.parse(
    readFileSync(join(dataDir, "manifest.json"), "utf8"),
  );
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("treaty" in parsed) ||
    typeof parsed.treaty !== "string" ||
    !("files" in parsed) ||
    parsed.files === null ||
    typeof parsed.files !== "object"
  )
    throw new Error(`${dataDir}manifest.json is not a treaty manifest`);
  const files: Record<string, string> = {};
  for (const [path, hash] of Object.entries(parsed.files))
    if (typeof hash === "string") files[path] = hash;
  return { treaty: parsed.treaty, files };
}

/** The data this package was released with. */
export function loadInstalledBundle(dataDir = installedDataDir()): Bundle {
  const files = new Map<string, unknown>();
  for (const path of Object.keys(readManifest(dataDir).files))
    files.set(path, JSON.parse(readFileSync(join(dataDir, path), "utf8")));
  return createBundle(files);
}
