import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA_BASE } from "../src/index.ts";

test("SCHEMA_BASE is the prefix of every dataschema in the catalogue", () => {
  const catalog = JSON.parse(
    readFileSync(
      join(import.meta.dir, "../../../schemas/catalog.json"),
      "utf8",
    ),
  );
  for (const e of catalog.events)
    expect(e.dataschema.startsWith(SCHEMA_BASE)).toBe(true);
});
