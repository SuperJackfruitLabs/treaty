/**
 * MCP contracts: tool catalogs under schemas/mcp/, read as data
 * (`schemas/treaty/mcp-catalog.v1.json`).
 *
 * A catalog names each tool's scope, input schema and result shape. A producer compares the tools
 * it registers with its catalog; a consumer that names tools checks each name is in it.
 */
import { resolvePointer, type Cases, isCases } from "./cases.ts";
import { validatorFor, type Bundle, type Result } from "./schemas.ts";

export const MCP_CATALOG_SCHEMA = "schemas/treaty/mcp-catalog.v1.json";

export type PayloadCarrier = "text-json" | "structured";

export interface Payload {
  carrier: PayloadCarrier;
  /** JSON pointer, within the catalog, to the carried document's schema. */
  schema: string;
}

export interface McpTool {
  name: string;
  /** The scope a caller needs to be offered the tool; null when every caller is. */
  scope: string | null;
  description: string;
  /** JSON pointer, within the catalog, to the tool's input schema. */
  inputSchema: string;
  result: Payload;
  annotations?: Record<string, unknown>;
}

export interface McpCatalog {
  /** Repository path of the catalog. */
  path: string;
  server: { name: string; path?: string };
  tools: McpTool[];
  /** What a result with `isError: true` carries, when the catalog says. */
  error?: Payload;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** `superpipeline.v1` → `schemas/mcp/superpipeline.v1.json`; a repository path stays as it is. */
export function mcpCatalogPath(name: string): string {
  if (name.startsWith("schemas/")) return name;
  if (!/\.v[1-9][0-9]*$/.test(name))
    throw new Error(
      `name the catalog's version too: ${JSON.stringify(name)} (e.g. "${name}.v1")`,
    );
  return `schemas/mcp/${name}.json`;
}

/** The cases file beside a catalog: `fixtures/mcp/<server>.v<N>.cases.json`. */
export function mcpCasesPath(catalogPath: string): string {
  return catalogPath
    .replace(/^schemas\//, "fixtures/")
    .replace(/\.json$/, ".cases.json");
}

function payload(node: unknown, at: string): Payload | undefined {
  if (!isObject(node)) return undefined;
  const carrier = node.carrier === "structured" ? "structured" : "text-json";
  return { carrier, schema: `${at}/schema` };
}

/**
 * The catalog a bundle holds, checked against `schemas/treaty/mcp-catalog.v1.json`. `name` is
 * `<server>.v<N>` or a repository path. Throws when the bundle lacks it or it does not hold.
 */
export function mcpCatalog(bundle: Bundle, name: string): McpCatalog {
  const path = mcpCatalogPath(name);
  const doc = bundle.files.get(path);
  if (!isObject(doc)) throw new Error(`${path} is not in the bundle`);
  const checked = validatorFor(bundle, MCP_CATALOG_SCHEMA)(doc);
  if (!checked.valid)
    throw new Error(`${path} is not an MCP catalog: ${checked.errors[0]}`);
  const server = isObject(doc.server) ? doc.server : {};
  const tools: McpTool[] = [];
  for (const [i, node] of (Array.isArray(doc.tools)
    ? doc.tools
    : []
  ).entries()) {
    if (!isObject(node)) continue;
    const at = `/tools/${i}`;
    tools.push({
      name: String(node.name),
      scope: typeof node.scope === "string" ? node.scope : null,
      description: String(node.description),
      inputSchema: `${at}/inputSchema`,
      result: payload(node.result, `${at}/result`) ?? {
        carrier: "text-json",
        schema: `${at}/result/schema`,
      },
      ...(isObject(node.annotations) ? { annotations: node.annotations } : {}),
    });
  }
  const error = payload(doc.error, "/error");
  return {
    path,
    server: {
      name: String(server.name),
      ...(typeof server.path === "string" ? { path: server.path } : {}),
    },
    tools,
    ...(error ? { error } : {}),
  };
}

export function findTool(
  catalog: McpCatalog,
  name: string,
): McpTool | undefined {
  return catalog.tools.find((t) => t.name === name);
}

/** Names in `names` the catalog does not hold: a prompt naming a removed tool, or a typo. */
export function unknownTools(
  catalog: McpCatalog,
  names: Iterable<string>,
): string[] {
  return [...new Set(names)].filter((n) => !findTool(catalog, n));
}

function missing(catalog: McpCatalog, name: string): Result {
  return {
    valid: false,
    errors: [`${name} is not a tool in ${catalog.path}`],
  };
}

/** Checks a `tools/call`'s arguments; absent arguments are read as `{}`, as MCP does. */
export function validateToolArguments(
  bundle: Bundle,
  catalog: McpCatalog,
  tool: string,
  args: unknown,
): Result {
  const found = findTool(catalog, tool);
  if (!found) return missing(catalog, tool);
  return validatorFor(
    bundle,
    `${catalog.path}#${found.inputSchema}`,
  )(args ?? {});
}

/** The document a result carries, or why it carries none. */
function carried(
  result: Record<string, unknown>,
  carrier: PayloadCarrier,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (carrier === "structured")
    return "structuredContent" in result
      ? { ok: true, value: result.structuredContent }
      : { ok: false, error: "the result has no structuredContent" };
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.find(
    (c: unknown) =>
      isObject(c) && c.type === "text" && typeof c.text === "string",
  );
  if (!isObject(text) || typeof text.text !== "string")
    return { ok: false, error: "the result has no text content" };
  try {
    return { ok: true, value: JSON.parse(text.text) };
  } catch {
    return { ok: false, error: "the result's text content is not JSON" };
  }
}

/**
 * Checks a `tools/call` result (`{ content, isError?, structuredContent? }`) against the tool's
 * result shape, or against the catalog's `error` when `isError` is true. A failure in a catalog
 * that declares no `error` shape is accepted as it is.
 */
export function validateToolResult(
  bundle: Bundle,
  catalog: McpCatalog,
  tool: string,
  result: unknown,
): Result {
  const found = findTool(catalog, tool);
  if (!found) return missing(catalog, tool);
  if (!isObject(result))
    return { valid: false, errors: ["a tool result is an object"] };
  const shape = result.isError === true ? catalog.error : found.result;
  if (!shape) return { valid: true, errors: [] };
  const value = carried(result, shape.carrier);
  if (!value.ok) return { valid: false, errors: [value.error] };
  return validatorFor(bundle, `${catalog.path}#${shape.schema}`)(value.value);
}

/** Checks a carried document directly (what a cases file holds): a tool's result, or `error`. */
export function validateToolPayload(
  bundle: Bundle,
  catalog: McpCatalog,
  /** A tool name, or `"error"` for the catalog's error shape. */
  tool: string,
  value: unknown,
): Result {
  const shape =
    tool === "error" ? catalog.error : findTool(catalog, tool)?.result;
  if (!shape)
    return tool === "error"
      ? { valid: false, errors: [`${catalog.path} declares no error shape`] }
      : missing(catalog, tool);
  return validatorFor(bundle, `${catalog.path}#${shape.schema}`)(value);
}

/**
 * Every rule a catalog keeps beyond its meta-schema: tool names are unique, and every tool has
 * argument cases with at least one valid and one invalid, each answered as it says. Result and
 * error cases, where the file holds them, are checked the same way.
 */
export function checkMcpCatalog(bundle: Bundle, name: string): string[] {
  let catalog: McpCatalog;
  try {
    catalog = mcpCatalog(bundle, name);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const t of catalog.tools) {
    if (seen.has(t.name)) problems.push(`${t.name} is listed twice`);
    seen.add(t.name);
  }
  const casesPath = mcpCasesPath(catalog.path);
  const file = bundle.files.get(casesPath);
  if (!isObject(file)) return [...problems, `${casesPath} is missing`];
  const run = (
    label: string,
    cases: Cases,
    check: (value: unknown) => Result,
    needBoth: boolean,
  ) => {
    if (needBoth && Object.keys(cases.valid).length === 0)
      problems.push(`${label} has no valid case`);
    if (needBoth && cases.invalid.length === 0)
      problems.push(`${label} has no invalid case`);
    for (const [l, body] of Object.entries(cases.valid)) {
      const r = check(body);
      if (!r.valid)
        problems.push(`${label} refuses ${l}: ${r.errors.join("; ")}`);
    }
    for (const { why, body } of cases.invalid)
      if (check(body).valid) problems.push(`${label} accepts ${why}`);
  };
  const tools = isObject(file.tools) ? file.tools : {};
  for (const listed of Object.keys(tools))
    if (!seen.has(listed))
      problems.push(`${casesPath} has cases for ${listed}, which is no tool`);
  for (const t of catalog.tools) {
    const args = resolvePointer(file, `/tools/${t.name}/arguments`);
    if (!isCases(args)) {
      problems.push(`${t.name} has no argument cases`);
      continue;
    }
    run(
      `${t.name} arguments`,
      args,
      (v) => validateToolArguments(bundle, catalog, t.name, v),
      true,
    );
    const res = resolvePointer(file, `/tools/${t.name}/result`);
    if (isCases(res))
      run(
        `${t.name} result`,
        res,
        (v) => validateToolPayload(bundle, catalog, t.name, v),
        false,
      );
  }
  if (isCases(file.error))
    run(
      "error",
      file.error,
      (v) => validateToolPayload(bundle, catalog, "error", v),
      false,
    );
  return problems;
}
