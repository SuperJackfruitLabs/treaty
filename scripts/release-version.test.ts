import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { publishablePackages, versionFromTag } from "./release-version.ts";

describe("versionFromTag", () => {
  test("takes the version from a vX.Y.Z tag", () => {
    expect(versionFromTag("v0.0.1")).toBe("0.0.1");
  });

  test.each(["0.0.1", "v0.0", "v0.0.1-rc.1", "refs/tags/v0.0.1", ""])(
    "refuses %p",
    (tag) => {
      expect(() => versionFromTag(tag)).toThrow("not a release tag");
    },
  );
});

describe("publishablePackages", () => {
  test("includes the cloudevents package", () => {
    const root = join(import.meta.dir, "..");
    expect(publishablePackages(root)).toContain(
      join(root, "packages", "cloudevents"),
    );
  });
});
