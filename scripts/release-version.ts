/**
 * Stamps a release tag's version onto every publishable package, and copies the licence in.
 *
 * Usage: bun scripts/release-version.ts v0.0.1
 *
 * Every package in packages/ that is not `private` is published at the tag's version, so one tag
 * releases them all together. The version in each package.json on main stays 0.0.0; the tag is the
 * only source of the version.
 */
import {
  copyFileSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const TAG = /^v(\d+\.\d+\.\d+)$/;

export function versionFromTag(tag: string): string {
  const match = TAG.exec(tag);
  if (!match?.[1]) {
    throw new Error(
      `not a release tag: ${JSON.stringify(tag)} (expected vX.Y.Z)`,
    );
  }
  return match[1];
}

export function publishablePackages(root: string): string[] {
  const dir = join(root, "packages");
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(dir, entry.name))
    .filter((pkg) => {
      const manifest = JSON.parse(
        readFileSync(join(pkg, "package.json"), "utf8"),
      );
      return manifest.private !== true;
    });
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const version = versionFromTag(process.argv[2] ?? "");
  for (const pkg of publishablePackages(root)) {
    const file = join(pkg, "package.json");
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    manifest.version = version;
    writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
    copyFileSync(join(root, "LICENSE"), join(pkg, "LICENSE"));
    console.log(`${manifest.name}@${version}`);
  }
}
