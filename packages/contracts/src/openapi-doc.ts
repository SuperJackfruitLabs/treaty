/**
 * Reading an OpenAPI 3.1 document the way a client and a server see it: local `$ref`s to
 * components followed, path-level parameters merged into each operation, and every operation
 * keyed even when it has no `operationId`.
 */
import { resolvePointer } from "./cases.ts";

export const METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "patch",
  "head",
  "options",
] as const;
export type Method = (typeof METHODS)[number];
export const JSON_MEDIA = "application/json";

export type Node = Record<string, unknown>;

export function isObject(value: unknown): value is Node {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Escapes one token of a JSON pointer (RFC 6901). */
export function token(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

/**
 * Follows local `$ref`s (`#/components/...`) from a node until it reaches one that is not a
 * reference. Returns the node and its pointer within the document, or undefined when a reference
 * leads nowhere or loops.
 */
export function deref(
  doc: unknown,
  node: unknown,
  pointer: string,
): { node: Node; pointer: string } | undefined {
  let current = node;
  let at = pointer;
  for (let hops = 0; hops < 32; hops += 1) {
    if (!isObject(current)) return undefined;
    const ref = current.$ref;
    if (typeof ref !== "string") return { node: current, pointer: at };
    if (!ref.startsWith("#/")) return { node: current, pointer: at };
    at = ref.slice(1);
    current = resolvePointer(doc, at);
  }
  return undefined;
}

/** The pointer to a request body's or response's JSON schema, following `$ref`s, or undefined. */
export function bodySchemaPointer(
  doc: unknown,
  holder: unknown,
  pointer: string,
): string | undefined {
  const resolved = deref(doc, holder, pointer);
  if (!resolved || !isObject(resolved.node.content)) return undefined;
  const media = resolved.node.content[JSON_MEDIA];
  if (!isObject(media) || media.schema === undefined) return undefined;
  return `${resolved.pointer}/content/${token(JSON_MEDIA)}/schema`;
}

export interface DocOperation {
  /** `operationId`, or `METHOD path` when there is none. */
  key: string;
  operationId?: string;
  method: Method;
  path: string;
  /** Pointer to the operation object. */
  pointer: string;
  node: Node;
  /** Path-level and operation-level parameters, resolved; the operation's win by `in` and `name`. */
  parameters: Map<string, Node>;
  /** The request body, resolved, or undefined. */
  requestBody?: { node: Node; pointer: string };
}

function resolvedParameters(
  doc: unknown,
  list: unknown,
  pointer: string,
  into: Map<string, Node>,
): void {
  if (!Array.isArray(list)) return;
  for (const [i, entry] of list.entries()) {
    const p = deref(doc, entry, `${pointer}/${i}`)?.node;
    if (p && typeof p.name === "string" && typeof p.in === "string")
      into.set(`${p.in}:${p.name}`, p);
  }
}

export function documentOperations(doc: unknown): DocOperation[] {
  if (!isObject(doc) || !isObject(doc.paths)) return [];
  const found: DocOperation[] = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    if (!isObject(item)) continue;
    const itemPointer = `/paths/${token(path)}`;
    for (const method of METHODS) {
      const op = item[method];
      if (!isObject(op)) continue;
      const pointer = `${itemPointer}/${method}`;
      const parameters = new Map<string, Node>();
      resolvedParameters(
        doc,
        item.parameters,
        `${itemPointer}/parameters`,
        parameters,
      );
      resolvedParameters(
        doc,
        op.parameters,
        `${pointer}/parameters`,
        parameters,
      );
      const requestBody =
        op.requestBody === undefined
          ? undefined
          : deref(doc, op.requestBody, `${pointer}/requestBody`);
      const operationId =
        typeof op.operationId === "string" ? op.operationId : undefined;
      found.push({
        key: operationId ?? `${method.toUpperCase()} ${path}`,
        ...(operationId ? { operationId } : {}),
        method,
        path,
        pointer,
        node: op,
        parameters,
        ...(requestBody ? { requestBody } : {}),
      });
    }
  }
  return found;
}
