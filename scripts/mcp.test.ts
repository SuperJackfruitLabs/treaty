import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { checkMcpCatalog, mcpCatalog } from "../packages/contracts/src/mcp.ts";
import { loadBundle } from "../packages/contracts/src/node.ts";
import { readRegistry } from "../packages/contracts/src/registry.ts";

const bundle = loadBundle(join(import.meta.dir, ".."));
const registry = readRegistry(bundle);
const catalogs = [...bundle.files.keys()]
  .filter((p) => /^schemas\/mcp\/.+\.json$/.test(p))
  .toSorted();

describe("schemas/mcp", () => {
  test("the MCP catalogs are recorded here, so adding one is a visible diff", () => {
    expect(catalogs).toEqual(["schemas/mcp/superpipeline.v1.json"]);
  });

  for (const path of catalogs) {
    test(`${path} keeps every rule, and its cases answer as they say`, () => {
      expect(checkMcpCatalog(bundle, path)).toEqual([]);
    });
  }

  test("every mcp crossing's catalog exists", () => {
    const missing = registry.crossings
      .filter((c) => c.kind === "mcp")
      .flatMap((c) => c.contract)
      .filter((p) => p.startsWith("schemas/") && !catalogs.includes(p));
    expect(missing).toEqual([]);
  });

  test("SuperPipeline's 15 tools and their scopes (TOOL_SCOPE in apps/api/src/mcp/tools.ts)", () => {
    const catalog = mcpCatalog(bundle, "superpipeline.v1");
    expect(
      Object.fromEntries(catalog.tools.map((t) => [t.name, t.scope])),
    ).toEqual({
      superpipeline_list_work: null,
      superpipeline_claim_card: "claim",
      superpipeline_get_card: null,
      superpipeline_get_run: null,
      superpipeline_add_reference: "run",
      superpipeline_split_card: "run",
      superpipeline_list_comments: null,
      superpipeline_post_comment: "run",
      superpipeline_heartbeat: "run",
      superpipeline_post_activity: "run",
      superpipeline_submit_for_review: "run",
      superpipeline_complete: "run",
      superpipeline_block: "run",
      superpipeline_release: "run",
      superpipeline_fail: "run",
    });
  });
});
