/**
 * The v1 cards that ride inside a prose message, each under one namespaced content key, and the
 * permission request card. Moved from AgentPod's `packages/contract/src/matrix-events.ts`.
 *
 * A permission request and a superpipeline gate were each sent as TWO events: a prose
 * `m.room.message` and, beside it, a custom event type a client could draw buttons from. That pair
 * costs a phone two pushes for one question in an encrypted room, and in an unencrypted room the
 * custom type matches no push rule at all. So the structured request rides INSIDE the prose message
 * too, under one namespaced key. The separate custom event is still sent while clients in the field
 * read it; both carry the SAME payload, so a client may read either.
 *
 * Versioning is `schema_version` inside the payload, bumped for additive changes only. A breaking
 * change mints a new key rather than reusing this one.
 */

import { z, type Infer } from "./check.ts";

/**
 * The permission request, embedded in the prose message under this key. The payload is exactly
 * {@link PermissionRequestEvent}, the body of the legacy `dev.agentpod.permission.v1` event, so a
 * client parses both with one schema. Answering is an ordinary room message carrying an option's
 * `name` (or its number), matched against the request the hub holds for that room.
 */
export const PERMISSION_REQUEST_CONTENT_KEY = "dev.agentpod.permission";
/** The legacy custom event type that carries the same payload as {@link PERMISSION_REQUEST_CONTENT_KEY}. */
export const PERMISSION_REQUEST_EVENT_TYPE = "dev.agentpod.permission.v1";

/**
 * A permission request, structured so a client can render buttons. Four options at most, because
 * SuperMessage draws four and drops the rest; the prose message lists every option, so a fifth stays
 * answerable by number or name.
 */
export const PermissionRequestEvent = z.object({
  schema_version: z.literal(1),
  session_id: z.string(),
  /** The request's own ACP sequence number, which is how the hub addresses it. */
  request_seq: z.number().int().nonnegative(),
  title: z.string(),
  options: z
    .array(z.object({ option_id: z.string(), name: z.string() }))
    .min(1)
    .max(4),
});
export type PermissionRequestEvent = Infer<typeof PermissionRequestEvent>;

/** One option of a superpipeline gate. `id` is superpipeline's `GateDecision`. */
export const GateRequestOption = z.object({
  id: z.enum(["approve", "request_changes", "reject"]),
  label: z.string(),
});
export type GateRequestOption = Infer<typeof GateRequestOption>;

/**
 * A superpipeline approval gate, embedded in the prose message under this key: the body of the
 * legacy `dev.superpipeline.gate.v1` event minus its `body`, which the carrying message already has.
 *
 * `schema_version` is a floor, not a literal: a renderer tolerates a higher minor version by
 * ignoring what it does not know.
 *
 * **Answering references the message that carries this key**, with
 * `suite_event_type: "dev.superpipeline.gate.decision.v1"` and
 * `m.relates_to: {rel_type: "m.reference", event_id: <this message's id>}`. The hub accepts a
 * reference to either the carrying message or the legacy custom event while both exist.
 */
export const GATE_REQUEST_CONTENT_KEY = "dev.superpipeline.gate";

/**
 * An agent's question, embedded in the prose message under this key. Its own key rather than a
 * gate's (whose option ids are a closed enum) or a permission's (addressed by ACP `session_id` and
 * `request_seq`). **Answering does not reference this event**: the answer is an ordinary room message
 * carrying an option's `id`, its `label`, or its 1-based number as printed in the prose.
 */
export const ELICITATION_REQUEST_CONTENT_KEY = "dev.superpipeline.elicitation";

export const ElicitationRequestOption = z.object({
  id: z.string().min(1),
  label: z.string(),
});
export type ElicitationRequestOption = Infer<typeof ElicitationRequestOption>;

const uniqueIds = (opts: ReadonlyArray<{ id: string }>): boolean =>
  new Set(opts.map((o) => o.id)).size === opts.length;

export const ElicitationRequestCard = z.object({
  /** A floor, not a literal: a renderer tolerates a higher version by ignoring it. */
  schema_version: z.number().int().min(1),
  board_id: z.string(),
  card_id: z.string(),
  /** What an answer is addressed to. Without it the question cannot be answered at all. */
  elicitation_id: z.string().min(1),
  run_id: z.string(),
  stage_key: z.string(),
  card_title: z.string(),
  /** The agent that is waiting, and the one identity the board will not let answer. */
  asked_by: z.string(),
  /** The question. The carrying message has it as its body too. */
  prompt: z.string(),
  /**
   * May be empty (an agent can stop on an open question), four at most (SuperMessage draws four),
   * and unique by id, because answering is by id.
   */
  options: z.array(ElicitationRequestOption).max(4).refine(uniqueIds),
  deep_link: z.string().optional(),
});
export type ElicitationRequestCard = Infer<typeof ElicitationRequestCard>;

export const GateRequestCard = z.object({
  schema_version: z.number().int().min(1),
  board_id: z.string(),
  card_id: z.string(),
  gate_id: z.string().min(1),
  stage_key: z.string(),
  return_stage_key: z.string(),
  card_title: z.string(),
  produced_by: z.string(),
  prompt: z.string(),
  handoff_summary: z.string().optional(),
  // Unique by id: resolution is by id, so two `approve` entries are ambiguous.
  options: z.array(GateRequestOption).min(1).max(3).refine(uniqueIds),
  deep_link: z.string().optional(),
});
export type GateRequestCard = Infer<typeof GateRequestCard>;
