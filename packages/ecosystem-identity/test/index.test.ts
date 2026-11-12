import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CORPUS_FILES } from "../src/index.ts";

const CORPUS = join(import.meta.dir, "../../../fixtures/ecosystem-identity");
const onDisk = readdirSync(CORPUS)
  .filter((name) => name.endsWith(".json"))
  .toSorted();

describe("the corpus", () => {
  test("lists exactly the JSON files in fixtures/ecosystem-identity", () => {
    expect<string[]>([...CORPUS_FILES].toSorted()).toEqual(onDisk);
  });

  for (const name of onDisk) {
    test(`${name} names itself and carries an integer version`, () => {
      const file = JSON.parse(readFileSync(join(CORPUS, name), "utf8"));
      expect(file.corpus).toBe(
        `ecosystem-identity/${name.replace(/\.json$/, "").replaceAll("_", "-")}`,
      );
      expect(Number.isInteger(file.version)).toBe(true);
    });
  }
});
