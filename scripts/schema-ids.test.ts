import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBundle } from "../packages/contracts/src/node.ts";
import {
  createBundle,
  misplacedIds,
  publishedIds,
} from "../packages/contracts/src/schemas.ts";

const root = join(import.meta.dir, "..");
const RUN_REPORT = "schemas/superwitness/run-report.v1.json";
const RUN_REPORT_ID =
  "https://docs.superwitness.dev/schemas/run-report.schema.json";

test("every schema's $id is the address of its own path, or one its crossing records", () => {
  expect(misplacedIds(loadBundle(root))).toEqual([]);
});

test("a schema copied without changing its $id is reported", () => {
  const id =
    "https://raw.githubusercontent.com/SuperJackfruitLabs/treaty/main/schemas/a.v1.json";
  const bundle = createBundle({
    "schemas/a.v1.json": { $id: id },
    "schemas/a.v2.json": { $id: id },
  });
  expect(misplacedIds(bundle)).toEqual([`schemas/a.v2.json has $id ${id}`]);
});

test("the only published $ids are the run report's (phase 4, ruling 3)", () => {
  expect([...publishedIds(loadBundle(root))]).toEqual([
    [RUN_REPORT, RUN_REPORT_ID],
  ]);
});

test("the run report keeps its $id only while contracts/published-ids.json lists it", () => {
  const files = new Map(loadBundle(root).files);
  files.delete("contracts/published-ids.json");
  expect(misplacedIds(createBundle(files))).toEqual([
    `${RUN_REPORT} has $id ${RUN_REPORT_ID}`,
  ]);
});

test("another schema with a foreign $id is reported", () => {
  const files = new Map(loadBundle(root).files);
  const id = "https://example.com/schemas/other.json";
  files.set("schemas/superwitness/other.v1.json", { $id: id });
  expect(misplacedIds(createBundle(files))).toEqual([
    `schemas/superwitness/other.v1.json has $id ${id}`,
  ]);
});

test("an exception whose file has another $id, or no file, is reported", () => {
  expect(
    misplacedIds(
      createBundle({
        "contracts/published-ids.json": {
          schemas: [
            { path: "schemas/a.v1.json", id: "https://example.com/a.json" },
            {
              path: "schemas/gone.v1.json",
              id: "https://example.com/gone.json",
            },
          ],
        },
        "schemas/a.v1.json": { $id: "https://example.com/b.json" },
      }),
    ),
  ).toEqual([
    "schemas/a.v1.json has $id https://example.com/b.json",
    "schemas/a.v1.json is listed in contracts/published-ids.json with $id https://example.com/a.json, not its own",
    "schemas/gone.v1.json is listed in contracts/published-ids.json with $id https://example.com/gone.json, not its own",
  ]);
});

test("the run report is byte for byte the file SuperWitness publishes", () => {
  const bytes = readFileSync(join(root, RUN_REPORT));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "b2444841f2d0a31ca6abc38aad13aedb99b9a653eec182344974f827a7c042fa",
  );
});
