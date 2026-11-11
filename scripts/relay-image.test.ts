import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The relay image installs with `bun install --frozen-lockfile`, which needs every workspace
 * package's manifest beside the lockfile. One left out makes the lockfile look changed and the
 * build fail: treaty v0.0.8 added `matrix-events`, the image did not copy its manifest, and the
 * production deploy failed and put v0.0.7 back.
 */
test("the relay image copies every workspace package's manifest", () => {
  const root = join(import.meta.dir, "..");
  const dockerfile = readFileSync(join(root, "apps/relay/Dockerfile"), "utf8");
  for (const workspace of ["packages", "apps"]) {
    for (const entry of readdirSync(join(root, workspace), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      const manifest = `${workspace}/${entry.name}/package.json`;
      if (!existsSync(join(root, manifest))) continue;
      expect(dockerfile).toContain(
        `COPY ${manifest} ${workspace}/${entry.name}/`,
      );
    }
  }
});
