/**
 * Loading a bundle from disk, for Node and Bun. Workers build one with `createBundle` instead.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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
