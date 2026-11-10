/**
 * The identity fixture corpus: plain JSON that every product checks its own types against.
 *
 * The corpus itself lives in `fixtures/ecosystem-identity/` at the repository root, so Go and
 * Swift can read it without TypeScript. The build copies it into this package's `corpus/`.
 * Import a file by its subpath:
 *
 *   import grammar from "@superjackfruitlabs/treaty-ecosystem-identity/id_grammar.json" with { type: "json" };
 */

/** Every file in the corpus, by the subpath it is published under. */
export const CORPUS_FILES = [
  "card_prompt.json",
  "id_grammar.json",
  "matrix_gate_events.json",
  "run_join_key.json",
  "token_claims.json",
] as const;

export type CorpusFile = (typeof CORPUS_FILES)[number];
