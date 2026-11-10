import { describe, expect, test } from "bun:test";
import { REQUIRED_ATTRIBUTES, SPEC_VERSION } from "../src/index.ts";

describe("the envelope constants", () => {
  test("pin CloudEvents 1.0", () => {
    expect(SPEC_VERSION).toBe("1.0");
  });

  test("list exactly the four attributes CloudEvents 1.0 requires", () => {
    expect([...REQUIRED_ATTRIBUTES].sort()).toEqual([
      "id",
      "source",
      "specversion",
      "type",
    ]);
  });
});
