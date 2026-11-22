import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = join(import.meta.dir, "../src");

/** Every module the main entry reaches, following relative imports. */
function reach(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  const text = readFileSync(join(src, file), "utf8");
  for (const [, spec] of text.matchAll(/from "\.\/([^"]+)"/g))
    if (spec) reach(spec, seen);
  return seen;
}

test("the main entry reaches no filesystem module, so it runs in Workers", () => {
  const touching = [...reach("index.ts")].filter((file) =>
    /from "node:/.test(readFileSync(join(src, file), "utf8")),
  );
  expect(touching).toEqual([]);
});
