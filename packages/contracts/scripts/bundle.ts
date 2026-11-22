/**
 * Copies treaty's data into the package and writes its manifest:
 *
 *   bun scripts/bundle.ts            (from packages/contracts, as part of `build`)
 *
 * data/ holds every JSON file under schemas/, fixtures/ and contracts/ at the repository root,
 * and data/manifest.json records the package version and each file's sha256, so a repository in
 * any language can check a copy against the release it pins.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export interface Manifest {
  treaty: string;
  files: Record<string, string>;
}

const ROOTS = ["schemas", "fixtures", "contracts"];

function walk(root: string, dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(root, path)).isDirectory() ? walk(root, path) : [path];
  });
}

export function buildBundle(root: string, out: string): Manifest {
  const pkg = join(out, "..");
  const { version } = JSON.parse(
    readFileSync(join(pkg, "package.json"), "utf8"),
  );
  rmSync(out, { recursive: true, force: true });
  const files: Record<string, string> = {};
  for (const top of ROOTS) {
    for (const path of walk(root, top).toSorted()) {
      if (!path.endsWith(".json")) continue;
      const target = join(out, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(root, path), target);
      files[path] = createHash("sha256")
        .update(readFileSync(target))
        .digest("hex");
    }
  }
  const manifest: Manifest = { treaty: String(version), files };
  writeFileSync(
    join(out, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

if (import.meta.main) {
  const pkg = join(import.meta.dir, "..");
  const manifest = buildBundle(join(pkg, "../.."), join(pkg, "data"));
  process.stdout.write(
    `bundle: ${Object.keys(manifest.files).length} files at treaty ${manifest.treaty}\n`,
  );
}
