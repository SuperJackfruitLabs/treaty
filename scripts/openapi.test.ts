import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { checkOpenApi } from "../packages/contracts/src/openapi-check.ts";
import { loadBundle } from "../packages/contracts/src/node.ts";
import { readRegistry } from "../packages/contracts/src/registry.ts";

const root = join(import.meta.dir, "..");
const bundle = loadBundle(root);
const registry = readRegistry(bundle);
const documents = [...bundle.files.keys()]
  .filter((p) => /^schemas\/http\/.+\.openapi\.json$/.test(p))
  .toSorted();

describe("schemas/http", () => {
  test("the number of HTTP contracts is recorded here, so adding one is a visible diff", () => {
    expect(documents).toEqual([
      "schemas/http/accounts/plane.v1.openapi.json",
      "schemas/http/agentpod/live-activity.v1.openapi.json",
      "schemas/http/superlibrary/api.v1.openapi.json",
      "schemas/http/superpipeline/agent-work.v1.openapi.json",
      "schemas/http/superpipeline/approvals.v1.openapi.json",
      "schemas/http/superpipeline/board-read.v1.openapi.json",
      "schemas/http/superpipeline/decisions.v1.openapi.json",
      "schemas/http/superpipeline/placement.v1.openapi.json",
      "schemas/http/superpipeline/push.v1.openapi.json",
    ]);
  });

  for (const path of documents) {
    test(`${path} keeps every rule`, () => {
      expect(checkOpenApi(bundle, path, registry)).toEqual([]);
    });
  }

  test("every http crossing's OpenAPI documents exist", () => {
    const missing = registry.crossings
      .filter((c) => c.kind === "http")
      .flatMap((c) => c.contract)
      .filter((p) => p.endsWith(".openapi.json") && !documents.includes(p));
    expect(missing).toEqual([]);
  });
});
