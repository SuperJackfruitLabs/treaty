/** The CloudEvents `specversion` every suite event carries. */
export const SPEC_VERSION = "1.0" as const;

/** The four attributes CloudEvents 1.0 requires on every event. */
export const REQUIRED_ATTRIBUTES = [
  "id",
  "source",
  "specversion",
  "type",
] as const;

export type RequiredAttribute = (typeof REQUIRED_ATTRIBUTES)[number];
