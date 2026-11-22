import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBundle } from "../packages/contracts/src/node.ts";
import { readRegistry } from "../packages/contracts/src/registry.ts";
import { readCheckouts, report } from "./coverage.ts";

const registry = readRegistry(loadBundle(join(import.meta.dir, "..")));
const work = mkdtempSync(join(tmpdir(), "treaty-coverage-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function checkout(name: string, manifest?: Record<string, unknown>): string {
  const dir = join(work, name);
  mkdirSync(dir, { recursive: true });
  if (manifest)
    writeFileSync(join(dir, "treaty.json"), JSON.stringify(manifest));
  return dir;
}

describe("coverage across the workspace", () => {
  const agreeing = checkout("superlibrary", {
    product: "superlibrary",
    treaty: "0.0.15",
    produces: ["superlibrary.api"],
    consumes: [
      "accounts.token-claims",
      "accounts.plane-api",
      "accounts.sign-in",
      "superpipeline.direct-push",
      "superpipeline.board-read",
      "agentpod.capability-catalog",
    ],
  });
  const disagreeing = checkout("superdispatch", {
    product: "superdispatch",
    treaty: "0.0.12",
    produces: [],
    consumes: ["superpipeline.events", "superpipeline.agent-work"],
  });
  const bare = checkout("supermessage");
  const silentOwner = checkout("superwitness", {
    product: "superwitness",
    treaty: "0.0.15",
    produces: [],
    consumes: [],
  });
  const out = report(
    registry,
    readCheckouts([agreeing, disagreeing, bare, silentOwner]),
    "0.0.15",
  );

  test("reports the registry's coverage", () => {
    expect(out.coverage.percent).toBe(27);
  });

  test("an agreeing product has nothing against it", () => {
    expect(out.problems.filter((p) => p.product === "superlibrary")).toEqual(
      [],
    );
  });

  test("a consumer the registry does not list is reported by id", () => {
    expect(out.problems).toContainEqual({
      product: "superdispatch",
      kind: "unlisted-consumer",
      id: "superpipeline.agent-work",
    });
  });

  test("a crossing the registry lists for a product it does not declare is reported", () => {
    expect(out.problems).toContainEqual({
      product: "superdispatch",
      kind: "undeclared-consumer",
      id: "superpipeline.placement",
    });
  });

  test("a crossing a product owns but does not declare is reported", () => {
    expect(out.problems).toContainEqual({
      product: "superwitness",
      kind: "undeclared-producer",
      id: "superwitness.runs",
    });
  });

  test("a pin behind the latest release is reported", () => {
    expect(out.problems).toContainEqual({
      product: "superdispatch",
      kind: "pin-behind",
      id: "0.0.12",
    });
  });

  test("a checkout without treaty.json is counted as undeclared", () => {
    expect(out.withoutManifest).toEqual(["supermessage"]);
  });
});
