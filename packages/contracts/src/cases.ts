/**
 * The valid and invalid cases treaty keeps for each schema, read from the place the registry
 * names (`cases` on a crossing: schema path → "<fixture path>#<JSON pointer>").
 */
import type { Registry } from "./registry.ts";
import type { Bundle } from "./schemas.ts";

export interface Cases {
  valid: Record<string, unknown>;
  invalid: { why: string; body: unknown }[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function resolvePointer(doc: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return doc;
  return pointer
    .slice(1)
    .split("/")
    .map((t) =>
      decodeURIComponent(t).replaceAll("~1", "/").replaceAll("~0", "~"),
    )
    .reduce<unknown>(
      (node, t) =>
        Array.isArray(node)
          ? node[Number(t)]
          : isObject(node)
            ? node[t]
            : undefined,
      doc,
    );
}

export function isCases(value: unknown): value is Cases {
  if (
    !isObject(value) ||
    !isObject(value.valid) ||
    !Array.isArray(value.invalid)
  )
    return false;
  return value.invalid.every(
    (c: unknown) => isObject(c) && typeof c.why === "string" && "body" in c,
  );
}

/** A schema's cases: where the registry names them, else `fixtures/<path>.cases.json`; or undefined. */
export function casesFor(
  bundle: Bundle,
  registry: Registry | undefined,
  schemaPath: string,
): Cases | undefined {
  for (const crossing of registry?.crossings ?? []) {
    const location = crossing.cases?.[schemaPath];
    if (!location) continue;
    const [file = "", pointer = ""] = location.split("#");
    const node = resolvePointer(bundle.files.get(file), pointer);
    if (isCases(node)) return node;
  }
  // A schema no crossing names (schemas/common/) keeps its cases beside it by convention.
  const conventional = bundle.files.get(
    schemaPath
      .replace(/^schemas\//, "fixtures/")
      .replace(/\.json$/, ".cases.json"),
  );
  return isCases(conventional) ? conventional : undefined;
}
