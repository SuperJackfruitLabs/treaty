/**
 * The names of the room a board's gates close in, and of the identity that speaks there.
 *
 * charter → `decisions/2026-09-28-a-gate-belongs-to-its-board-not-to-an-agents-room.md`. A board
 * room is spoken by an identity whose keys its carrier owns outright, so it can both encrypt for and
 * decrypt for it. Moved from the hub's `board-chat/board-room.ts`: the names only. Creating rooms
 * and inviting people stay with the carrier.
 *
 * The localpart and the alias sit inside the AgentPod appservice's exclusive `@agent_.*` and
 * `#agentpod_.*` namespaces, which is where every board room lives today. A carrier with its own
 * namespace (SuperExchange) needs its own names; these stay what existing rooms are called.
 */

/** The localpart the board speaks as. */
export const BOARD_SPEAKER_LOCALPART = "agent_superpipeline";
/** What anybody in the room sees as the speaker's name. */
export const BOARD_SPEAKER_DISPLAY_NAME = "superpipeline";

/** The room alias's localpart for a board: `agentpod_board_<board id>`, unsafe characters as `_`. */
export function boardRoomAlias(boardId: string): string {
  return `agentpod_board_${boardId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/** The speaker's full Matrix id on a homeserver. */
export function boardSpeakerMxid(domain: string): string {
  return `@${BOARD_SPEAKER_LOCALPART}:${domain}`;
}
