import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as builder from "./matrix-examples.ts";

// Pins what scripts/matrix-examples.ts writes, byte for byte, and what it exports.
// matrix-schemas.test.ts compares the corpus as data, which ignores key order and formatting; this
// test holds the file itself, so a restructure of the builder that changes a byte fails here.

test("the builder writes the committed corpus byte for byte", () => {
  const written = `${JSON.stringify(builder.buildExamples(), null, 2)}\n`;
  expect(written === readFileSync(builder.EXAMPLES_PATH, "utf8")).toBe(true);
});

test("the builder exports the corpus path and buildExamples, nothing else", () => {
  expect(Object.keys(builder).toSorted()).toEqual([
    "EXAMPLES_PATH",
    "buildExamples",
  ]);
});
