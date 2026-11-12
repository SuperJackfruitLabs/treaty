/** The shape of the corpus scripts/matrix-examples.ts builds. */

export type Invalid = {
  why: string;
  refusedBy: "schema" | "unique" | "recorded";
  body: unknown;
};
export type Examples = Record<
  string,
  { valid: Record<string, unknown>; invalid: Invalid[] }
>;
