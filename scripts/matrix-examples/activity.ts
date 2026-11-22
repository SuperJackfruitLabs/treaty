/**
 * The cases for AgentPod's chat activity: the turn record, the three live deltas, and the three
 * content keys (the turn error card and the two voice keys). Treaty holds no builder for these, so
 * the valid cases are the bodies the producers emit, written out from their code:
 *
 * - `hub:` the AgentPod hub's builders (`deltaContent`, `toolUpdateContent`,
 *   `turnActivityContent`, `turnErrorCard`, `transcriptContent`, `voiceReplyContent`);
 * - `hermes:` the Hermes plugin (`agentpod-live`), which sends a turn id as `session_id`, makes up
 *   `tc-` ids for a call that has none, and starts a call at `in_progress`, never `pending`;
 * - `reader:` what a reader must still draw: a higher `schema_version`, a value the known set does
 *   not list, a property it does not know.
 *
 * Every invalid case is refused by the schema.
 */

import type { Examples } from "./types.ts";

type Body = Record<string, unknown>;

const ROOM = "!station:example.org";

const without = (body: Body, key: string): Body =>
  Object.fromEntries(Object.entries(body).filter(([k]) => k !== key));

function add(
  out: Examples,
  type: string,
  valid: Record<string, Body>,
  invalid: Array<[string, unknown]>,
): void {
  const entry = (out[type] ??= { valid: {}, invalid: [] });
  Object.assign(entry.valid, valid);
  for (const [why, body] of invalid)
    entry.invalid.push({ why, refusedBy: "schema", body });
}

/** One invalid case per required field, each the first valid case without it. */
const missing = (base: Body, required: string[]): Array<[string, unknown]> =>
  required.map((k) => [`no ${k}`, without(base, k)]);

const tool = (id: string, status: string, kind?: string): Body => ({
  id,
  title: `Step ${id}`,
  ...(kind === undefined ? {} : { kind }),
  status,
  locations: [],
});

const attempt = (model: string): Body => ({
  provider: "anthropic",
  model,
  kind: "rate_limit",
  message: "429 Too Many Requests",
});

function deltas(out: Examples): void {
  const hub: Body = {
    room_id: ROOM,
    session_id: "sess_1",
    seq: 3,
    text: "The failing test reads a stale fixture.",
    done: false,
  };
  const required = ["room_id", "session_id", "seq", "text", "done"];
  const types: Array<[string, string]> = [
    [
      "dev.agentpod.stream.delta",
      "The failing test reads a stale fixture. Fixed.",
    ],
    ["dev.agentpod.thought.delta", "The fixture predates the rename, so"],
  ];
  for (const [type, last] of types) {
    add(
      out,
      type,
      {
        "hub: a delta mid-turn, everything so far": hub,
        "hub: the first delta of a turn": { ...hub, seq: 0, text: "The" },
        "hub: the last delta of a turn": {
          ...hub,
          seq: 4,
          text: last,
          done: true,
        },
        "hermes: the turn id as session_id, seq from 1": {
          room_id: ROOM,
          session_id: "turn_5b1f0c2e9a7d",
          seq: 1,
          text: "Checking the build log.",
          done: false,
        },
        "hermes: the closing delta with nothing new": {
          room_id: ROOM,
          session_id: "turn_5b1f0c2e9a7d",
          seq: 2,
          text: "Checking the build log.",
          done: true,
        },
        "reader: a property it does not know": { ...hub, pacing: "boundary" },
      },
      [
        ...missing(hub, required),
        ["a negative seq", { ...hub, seq: -1 }],
        ["a seq that is not a whole number", { ...hub, seq: 2.5 }],
        ["a seq written as a string", { ...hub, seq: "3" }],
        ["text that is not a string", { ...hub, text: 42 }],
        ["done that is not a boolean", { ...hub, done: "false" }],
        ["a session_id that is not a string", { ...hub, session_id: 7 }],
        ["a room_id that is not a string", { ...hub, room_id: null }],
        ["content that is not an object", [hub]],
      ],
    );
  }
}

function toolUpdates(out: Examples): void {
  const hub: Body = {
    room_id: ROOM,
    session_id: "sess_1",
    seq: 1,
    tool_call_id: "call_01",
    title: "Read src/main.ts",
    status: "pending",
    locations: ["src/main.ts"],
    kind: "read",
  };
  const hermes: Body = {
    room_id: ROOM,
    session_id: "turn_5b1f0c2e9a7d",
    seq: 1,
    tool_call_id: "tc-3f9a1c0b7e42",
    title: "terminal: cargo test",
    status: "in_progress",
    locations: [],
    kind: "execute",
  };
  add(
    out,
    "dev.agentpod.tool.update",
    {
      "hub: a call announced, pending, with its kind": hub,
      "hub: the call completed, the harness gave no kind": {
        ...without(hub, "kind"),
        seq: 2,
        status: "completed",
      },
      "hub: a failed call naming no path": {
        ...hub,
        seq: 3,
        tool_call_id: "call_02",
        title: "Run the tests",
        kind: "execute",
        status: "failed",
        locations: [],
      },
      "hermes: a call started at in_progress with a made-up tc- id": hermes,
      "hermes: the same call finished": {
        ...hermes,
        seq: 2,
        status: "completed",
      },
      "hermes: a call with no kind, falling back to the tool's name": {
        ...without(hermes, "kind"),
        seq: 3,
        tool_call_id: "tc-0d8e2b6a5c19",
        title: "write_file",
        status: "failed",
        locations: ["notes/todo.md"],
      },
      "reader: a status it does not know": { ...hub, status: "cancelled" },
      "reader: a kind it does not know": { ...hub, kind: "browse" },
      "reader: properties it does not know": {
        ...hub,
        started_at: "2026-11-23T10:00:00Z",
      },
    },
    [
      ...missing(hub, [
        "room_id",
        "session_id",
        "seq",
        "tool_call_id",
        "title",
        "status",
        "locations",
      ]),
      ["a negative seq", { ...hub, seq: -1 }],
      ["a status that is not a string", { ...hub, status: 1 }],
      ["a status that is empty", { ...hub, status: "" }],
      ["a status written as a label", { ...hub, status: "In progress" }],
      ["a kind that is not a string", { ...hub, kind: null }],
      ["locations that is not a list", { ...hub, locations: "src/main.ts" }],
      ["a location that is not a string", { ...hub, locations: [3] }],
      ["a tool_call_id that is not a string", { ...hub, tool_call_id: 1 }],
      ["a title that is not a string", { ...hub, title: ["Read"] }],
    ],
  );
}

function turns(out: Examples): void {
  const hub: Body = {
    schema_version: 1,
    session_id: "sess_1",
    tools: [
      {
        id: "call_01",
        title: "Read src/main.ts",
        kind: "read",
        status: "completed",
        locations: ["src/main.ts"],
      },
      {
        id: "call_02",
        title: "bash -lc 'cargo test'",
        kind: "execute",
        status: "failed",
        locations: [],
      },
    ],
    counts: { total: 2, failed: 1, omitted: 0 },
  };
  const twenty = Array.from({ length: 20 }, (_, i) =>
    tool(`t${i}`, "completed", "edit"),
  );
  add(
    out,
    "dev.agentpod.turn.v1",
    {
      "hub: two calls, one failed": hub,
      "hub: a capped list, the counts describing the whole turn": {
        schema_version: 1,
        session_id: "sess_2",
        tools: twenty,
        counts: { total: 25, failed: 0, omitted: 5 },
      },
      "hub: a call the harness gave no kind, still pending at the end": {
        schema_version: 1,
        session_id: "sess_3",
        tools: [tool("call_09", "pending")],
        counts: { total: 1, failed: 0, omitted: 0 },
      },
      "the wire allows a turn with no tools": {
        schema_version: 1,
        session_id: "sess_4",
        tools: [],
        counts: { total: 0, failed: 0, omitted: 0 },
      },
      "hermes ids: a turn id as session_id and tc- tool ids": {
        schema_version: 1,
        session_id: "turn_5b1f0c2e9a7d",
        tools: [tool("tc-3f9a1c0b7e42", "completed", "execute")],
        counts: { total: 1, failed: 0, omitted: 0 },
      },
      "reader: a higher schema_version, an unknown status and new fields, drawn best-effort":
        {
          schema_version: 2,
          session_id: "sess_5",
          tools: [
            { ...tool("call_01", "skipped", "browse"), duration_ms: 1200 },
          ],
          counts: { total: 1, failed: 0, omitted: 0, skipped: 1 },
          summary: "Looked at one page.",
        },
    },
    [
      ...missing(hub, ["schema_version", "session_id", "tools", "counts"]),
      ["schema_version 0", { ...hub, schema_version: 0 }],
      ["a schema_version written as a string", { ...hub, schema_version: "1" }],
      [
        "a schema_version that is not a whole number",
        { ...hub, schema_version: 1.5 },
      ],
      [
        "21 tools, over the cap of 20",
        { ...hub, tools: [...twenty, tool("t20", "completed")] },
      ],
      ["tools that is not a list", { ...hub, tools: {} }],
      [
        "a tool with no id",
        { ...hub, tools: [without(tool("a", "completed"), "id")] },
      ],
      [
        "a tool with no title",
        { ...hub, tools: [without(tool("a", "completed"), "title")] },
      ],
      [
        "a tool with no status",
        { ...hub, tools: [without(tool("a", "completed"), "status")] },
      ],
      [
        "a tool with no locations",
        { ...hub, tools: [without(tool("a", "completed"), "locations")] },
      ],
      [
        "a tool status that is not a string",
        { ...hub, tools: [{ ...tool("a", "completed"), status: true }] },
      ],
      ["counts with no omitted", { ...hub, counts: { total: 2, failed: 1 } }],
      [
        "a negative count",
        { ...hub, counts: { total: -1, failed: 0, omitted: 0 } },
      ],
      [
        "a count that is not a whole number",
        { ...hub, counts: { total: 2, failed: 0.5, omitted: 0 } },
      ],
    ],
  );
}

function turnErrors(out: Examples): void {
  const hub: Body = {
    schema_version: 1,
    kind: "quota",
    message: "You have hit your usage limit. Try again in 3 hours.",
    harness: "claude-code",
  };
  add(
    out,
    "dev.agentpod.turn_error",
    {
      "hub: the least a card carries": hub,
      "hub: a fallback chain, with provider, model and retryable": {
        schema_version: 1,
        kind: "provider_unavailable",
        message: "Every model the harness tried was unavailable.",
        harness: "openclaw",
        provider: "openrouter",
        model: "moonshotai/kimi-k2",
        retryable: true,
        attempts: [
          attempt("claude-sonnet-4-5"),
          {
            provider: "openrouter",
            model: "moonshotai/kimi-k2",
            kind: "provider_unavailable",
            message: "503 upstream unavailable",
          },
        ],
      },
      "hub: an attempt whose provider and model the harness did not say": {
        ...hub,
        attempts: [
          {
            provider: "unknown",
            model: "unknown",
            kind: "unknown",
            message: "Internal error",
          },
        ],
      },
      "hub: harness_disconnected, retryable": {
        schema_version: 1,
        kind: "harness_disconnected",
        message: "Internal error",
        harness: "openclaw",
        retryable: true,
      },
      "hub: every string at its bound and 16 attempts": {
        schema_version: 1,
        kind: "unknown",
        message: "m".repeat(4000),
        harness: "h".repeat(100),
        provider: "p".repeat(200),
        model: "o".repeat(200),
        attempts: Array.from({ length: 16 }, () => ({
          provider: "p".repeat(200),
          model: "o".repeat(200),
          kind: "timeout",
          message: "a".repeat(2000),
        })),
      },
      "reader: a higher schema_version and a kind it does not know": {
        schema_version: 2,
        kind: "budget_exhausted",
        message: "The workspace's monthly budget is spent.",
        harness: "salaam",
        attempts: [
          { ...attempt("claude-haiku-4-5"), kind: "budget_exhausted" },
        ],
        hint: "Raise the budget in settings.",
      },
    },
    [
      ...missing(hub, ["schema_version", "kind", "message", "harness"]),
      ["schema_version 0", { ...hub, schema_version: 0 }],
      ["a kind that is not a string", { ...hub, kind: 3 }],
      ["a kind that is empty", { ...hub, kind: "" }],
      ["an empty message", { ...hub, message: "" }],
      ["a message over 4000 characters", { ...hub, message: "m".repeat(4001) }],
      ["an empty harness", { ...hub, harness: "" }],
      ["a harness over 100 characters", { ...hub, harness: "h".repeat(101) }],
      ["a provider over 200 characters", { ...hub, provider: "p".repeat(201) }],
      ["an empty model", { ...hub, model: "" }],
      ["retryable that is not a boolean", { ...hub, retryable: "yes" }],
      [
        "17 attempts, over the bound of 16",
        { ...hub, attempts: Array.from({ length: 17 }, () => attempt("m")) },
      ],
      ["attempts that is not a list", { ...hub, attempts: attempt("m") }],
      [
        "an attempt with no model",
        { ...hub, attempts: [without(attempt("m"), "model")] },
      ],
      [
        "an attempt with no kind",
        { ...hub, attempts: [without(attempt("m"), "kind")] },
      ],
      [
        "an attempt message over 2000 characters",
        { ...hub, attempts: [{ ...attempt("m"), message: "a".repeat(2001) }] },
      ],
    ],
  );
}

function voice(out: Examples): void {
  const transcript: Body = {
    schema_version: 1,
    text: "hello there",
    language: "en",
    seconds: 42,
  };
  add(
    out,
    "dev.agentpod.voice_transcript",
    {
      "hub: text, language and length": transcript,
      "hub: text alone, the service named no language and the client no length":
        {
          schema_version: 1,
          text: "hi",
        },
      "hub: a note an hour long": { ...transcript, seconds: 3600 },
      "reader: a higher schema_version and a property it does not know": {
        ...transcript,
        schema_version: 2,
        confidence: 0.92,
      },
    },
    [
      ...missing(transcript, ["schema_version", "text"]),
      ["schema_version 0", { ...transcript, schema_version: 0 }],
      ["an empty transcript", { ...transcript, text: "" }],
      [
        "a transcript over 20000 characters",
        { ...transcript, text: "a".repeat(20001) },
      ],
      ["an empty language", { ...transcript, language: "" }],
      [
        "a language over 16 characters",
        { ...transcript, language: "e".repeat(17) },
      ],
      ["a note over an hour", { ...transcript, seconds: 3601 }],
      ["a negative length", { ...transcript, seconds: -1 }],
      ["a length that is not whole seconds", { ...transcript, seconds: 4.5 }],
    ],
  );

  const reply: Body = {
    schema_version: 1,
    text_event_id: "$Jt0hA1b2C3d4E5f6G7h8:example.org",
    voice: "bf_emma",
    seconds: 4,
  };
  add(
    out,
    "dev.agentpod.voice_reply",
    {
      "hub: the text it speaks, the voice and the length": reply,
      "hub: a blended voice, the audio's length unknown": {
        schema_version: 1,
        text_event_id: "$Jt0hA1b2C3d4E5f6G7h8:example.org",
        voice: "af_heart:60+af_bella:40",
      },
      "hub: an id and a voice at their bounds": {
        ...reply,
        text_event_id: `$${"e".repeat(254)}`,
        voice: "v".repeat(64),
        seconds: 0,
      },
      "reader: a higher schema_version and a property it does not know": {
        ...reply,
        schema_version: 2,
        speed: 1.1,
      },
    },
    [
      ...missing(reply, ["schema_version", "text_event_id", "voice"]),
      ["schema_version 0", { ...reply, schema_version: 0 }],
      ["an empty text_event_id", { ...reply, text_event_id: "" }],
      [
        "a text_event_id over 255 characters",
        { ...reply, text_event_id: `$${"e".repeat(255)}` },
      ],
      ["an empty voice", { ...reply, voice: "" }],
      ["a voice over 64 characters", { ...reply, voice: "v".repeat(65) }],
      ["audio over an hour", { ...reply, seconds: 3601 }],
      ["a length written as a string", { ...reply, seconds: "4" }],
    ],
  );
}

export function activity(out: Examples): void {
  deltas(out);
  toolUpdates(out);
  turns(out);
  turnErrors(out);
  voice(out);
}
