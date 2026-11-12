/**
 * The board-room Matrix event contract: every event a board's work crosses chat on, as a schema
 * (`schemas/matrix/`, plain data) and as TypeScript that builds and reads it.
 *
 * Moved from the AgentPod hub, behaviour unchanged (treaty `docs/2026-11-11-matrix-contract-plan.md`,
 * charter `decisions/2026-11-10-superexchange-owns-the-communication-server.md` decision 4). Type
 * strings are unchanged. Builders take what SuperPipeline sends (`deliveries.ts`) and return Matrix
 * content; parsers take Matrix content and return what a carrier acts on. Nothing here touches a
 * database, a homeserver or a log.
 */

export * from "./answers.ts";
export * from "./attention.ts";
export * from "./board-room.ts";
export * from "./cards.ts";
export * from "./checks.ts";
export * from "./decision-timeout.ts";
export * from "./deliveries.ts";
export * from "./delivery.ts";
export * from "./elicitation.ts";
export * from "./expiry.ts";
export * from "./gate.ts";
export * from "./permission.ts";
export * from "./question.ts";
export * from "./quorum.ts";
export * from "./release.ts";
export * from "./safe-url.ts";
export * from "./unique.ts";
