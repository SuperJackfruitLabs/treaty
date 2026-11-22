import { expect, test } from "bun:test";
import { join } from "node:path";
import { loadBundle } from "../packages/contracts/src/node.ts";
import {
  createBundle,
  misplacedIds,
} from "../packages/contracts/src/schemas.ts";

test("every schema's $id is the address of its own path", () => {
  expect(misplacedIds(loadBundle(join(import.meta.dir, "..")))).toEqual([]);
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
