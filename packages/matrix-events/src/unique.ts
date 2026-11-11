/**
 * The one rule a JSON Schema cannot state: values that must not repeat within a list, such as two
 * options sharing an id (answering is by id, so the answer would be ambiguous). Each schema in
 * `schemas/matrix/` that has such a rule lists it under `x-uniqueBy` as plain data, so a reader in
 * any language can apply it; this is the TypeScript reading of that list.
 *
 * A path is dot-separated, and `name[]` steps into each item of the list `name`: `options[].id` is
 * the `id` of every option, and `subject.variants[].subject.id` the subject id of every variant.
 */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Every value at `path` in `content`, in order; missing steps yield nothing. */
export function valuesAt(content: unknown, path: string): unknown[] {
  let current: unknown[] = [content];
  for (const step of path.split(".")) {
    const list = step.endsWith("[]");
    const key = list ? step.slice(0, -2) : step;
    const next: unknown[] = [];
    for (const v of current) {
      if (!isRecord(v) || !(key in v)) continue;
      const found = v[key];
      if (!list) next.push(found);
      else if (Array.isArray(found)) next.push(...found);
    }
    current = next;
  }
  return current;
}

/** The paths of `uniqueBy` whose values repeat in `content`; empty when none do. */
export function uniqueByViolations(
  content: unknown,
  uniqueBy: readonly string[],
): string[] {
  return uniqueBy.filter((path) => {
    const values = valuesAt(content, path).map((v) => JSON.stringify(v));
    return new Set(values).size !== values.length;
  });
}
