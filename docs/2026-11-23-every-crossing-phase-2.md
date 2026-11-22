# Every crossing, phase 2: events, chat activity and Live Activity

**Date:** 2026-11-23. Dated by the day it was written.
**Status:** Planned. Phase 1 is merged and proven on staging (2026-11-22). Its production tags
are the operator's.
**Inputs:** two read-only sweeps on 2026-11-23:

- SuperPipeline's direct push and treaty's relay, with every consumer;
- AgentPod's own Matrix events and Live Activity API, with their SuperMessage and Hermes sides.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** every event SuperPipeline sends travels under one envelope and one signature, on
whichever path, and AgentPod's chat activity and Live Activity are contracts in treaty that
SuperMessage reads from treaty's data.

**Architecture:**

- **One delivery contract.** Treaty's relay already defines it: CloudEvents binary mode, one
  stable event id, and `x-treaty-signature`. SuperPipeline's direct push adopts it, so it stays
  the standalone and per-agent path rather than being retired.
- **New contracts in treaty:**
  - every Matrix shape AgentPod sends, plus its Live Activity API and payload;
  - the two events that have no schema (`work.available` and `cards.stale`);
  - push registration.
- **New readers of treaty's data:**
  - SuperMessage vendors treaty's data through `treaty.json` and `treaty verify`;
  - the Hermes plugin's tests validate what it emits.

Coverage moves from 43% to 53%: `superpipeline.direct-push`, `agentpod.matrix-activity` and
`agentpod.live-activity` become contracted.

## What the sweeps found

### Events

- **Two paths carry SuperPipeline's events:**
  - **The relay** carries the 11 decision events and `card.ready`. It is a deployment setting
    (`RELAY_URL`), not a per-board one.
  - **The direct push** carries those 11 again, plus the 15 record events, `work.available` and
    `cards.stale`. Only it carries the last three groups.
- **The two signatures differ:**
  - The direct push signs the body with the subscriber's token as
    `X-Superpipeline-Signature: sha256=…`. There is no timestamp and no id, so a captured delivery
    replays indefinitely.
  - The relay signs `t.id.body` with a 300 s window.
- **Removing the direct push would break the standalone rule.** A SuperPipeline with no relay
  could notify nobody. It also carries per-agent subscriptions (`work.available` matched on
  capability and reservation), and the relay's static, estate-configured subscriber list cannot
  express those.
- **Retry semantics differ.**
  - The direct push retries any non-2xx response five times.
  - The relay retries only 408, 429, 5xx and network errors, and drops every other 4xx.
  - So the hub's and SuperLibrary's "unknown board" 404, retried today, would be lost on the
    relay.
  - The relay's delivery `fetch` has no timeout, while `ack_wait` is 30 s, so a slow receiver
    can be delivered to twice at once.
- **Event ids are per delivery row** (`<boardId>:<rowId>`), so one event on two paths shares no
  id.
- **The approval-request leak.** Approval-request `elicitation.pending`, which carries the
  request's arguments, reaches every subscriber whose filter matches. Today that is SuperExchange
  and SuperDispatch, across every workspace. SuperDispatch needs none of it.
- **Hand copies remain:**
  - the hub keeps its own `isElicitationPending`;
  - SuperDispatch hand-parses `card.ready`;
  - SuperLibrary hand-copies the record event names and parses bodies by hand.

### Chat activity and Live Activity

AgentPod sends seven shapes, and none is in treaty:

| Shape                           | Carrier                         |
| ------------------------------- | ------------------------------- |
| `dev.agentpod.turn.v1`          | room event                      |
| `dev.agentpod.stream.delta`     | to-device, no zod schema at all |
| `dev.agentpod.thought.delta`    | to-device                       |
| `dev.agentpod.tool.update`      | to-device                       |
| `dev.agentpod.turn_error`       | content key on `m.text`         |
| `dev.agentpod.voice_transcript` | content key on `m.notice`       |
| `dev.agentpod.voice_reply`      | content key on `m.audio`        |

- **Drift between producer and reader:**
  - SuperMessage reads `reasoning`, `input` and `output`, which nobody sends.
  - It lacks the `harness_disconnected` error kind and the `attention` decision kind; iOS shows
    attention as a permission.
  - Its voice readers accept only `schema_version` 1, while turn and error accept higher versions
    best-effort.
- **The Hermes plugin is a second producer**, byte-identical in two places. It sends a turn id
  as `session_id`, never sends `pending`, and makes up `tc-…` ids.
- **Live Activity has no contract:**
  - the token API (Matrix-style errors);
  - the APNs payload, which the hub never validates at runtime;
  - the `FleetContentState` fixtures, copied by hand into both repos.
- **SuperMessage checks treaty matrix-events at 0.0.10.** Its copy of `examples.json` is
  missing 32 newer invalid cases, and it has no `treaty.json`.

## Rulings this phase applies

These are defaults. Each is a line in a contract, so changing one later is a versioned change.

1. **The direct push stays, on the relay's contract.**
   - It uses the same CloudEvents binary-mode headers and the same data.
   - It signs with `x-treaty-signature`, using `signDelivery` with the push config's token as the
     secret.
   - It follows the same retry rules.
   - It carries what the relay cannot: deployments without a relay, and per-agent or per-board
     subscribers.
   - During the move it sends both signature headers. `X-Superpipeline-Signature` is removed in a
     later change, once every receiver verifies `x-treaty-signature`.
2. **One id per event, shared by both paths:** `<boardId>:<event seq>`, where the seq is the
   board's own event sequence. A consumer can then deduplicate across paths with treaty's
   `handleOnce`, or keep its domain-id dedupe.
3. **Every pushed event has a schema.** That adds `work.available.v1` and `cards.stale.v1`. Record
   events are relayed too.
4. **One receiver status contract, on both paths:**
   - 2xx means handled, or permanently ignored, such as an event the receiver does not take.
   - 503 means transient, such as a board this receiver has not mapped yet; try again.
   - Any other 4xx means permanently refused, such as an invalid body.
   - The relay's delivery request times out after 10 s, below its 30 s `ack_wait`.
5. **A subscriber receives only what it uses.** SuperDispatch's relay filter narrows to `card.*`
   events. Approval-request bodies reach only the readers that answer them: the hub and
   SuperExchange.
6. **All seven Matrix shapes go into treaty**, high-frequency deltas included, as body shapes
   only. Pacing stays AgentPod's.
   - Each schema states its carrier in `x-treaty-carrier`: `room-event`, `to-device`, or
     `content-key` with its `msgtype`.
   - Versioning: an inner integer `schema_version` where the shape has one today. Readers draw
     a higher version best-effort, never drop it. The deltas carry no version and change only
     additively.
   - **Enums are open to readers.** An unknown value is tolerated and drawn generically. The
     schema lists the known values in `x-treaty-known-values`.
   - `session_id` means a turn-scoped id: a new value starts a new turn. That covers both
     producers.
   - The three fields only the reader knows (`reasoning`, `input`, `output`) are removed from the
     reader, because no producer sends them.
7. **Live Activity:**
   - an OpenAPI document `schemas/http/agentpod/live-activity.v1.openapi.json`, with a third
     error envelope, `matrix-error.v1` (`{errcode, error}`);
   - JSON Schemas for `FleetContentState` and the `aps` payload;
   - the fleet fixtures, moved into treaty as cases.
8. **SuperMessage vendors treaty's data.** It vendors under `vendor/treaty/<treaty path>`,
   declares it in `treaty.json`, and replaces its `npm pack` check with `treaty verify`.
9. **A headless staging chat client** decides gates from chat. That closes the step phase 1
   could not prove.

## Release order

1. **treaty `v0.0.17`** carries this phase's treaty tasks. (#54's parameter validation already shipped in v0.0.16 on 2026-11-22.)
2. **SuperPipeline (producer):**
   - per-event ids;
   - the direct push on the relay's envelope, dual-signed;
   - the two new schemas' bodies;
   - record and work events relayed.
3. **estate:** the hub's relay filter widens to every decision event, and SuperDispatch's
   narrows to `card.*`.
4. **AgentPod hub (consumer and producer):**
   - its relay route takes all 11 decision events, and it drops them from its push subscription;
   - its own `isElicitationPending` copy goes;
   - its receivers follow ruling 4;
   - its Matrix and Live Activity producers are validated against treaty in tests, and the
     Hermes plugin's tests validate its bodies.
5. **Consumers, in any order:**
   - **SuperExchange:** ruling 4.
   - **SuperDispatch:** `card.ready` through treaty's schema.
   - **SuperLibrary:** record events through `record.v1`, and `x-treaty-signature` verified on
     its push.
   - **SuperMessage:** the vendored data, `treaty.json`, and the reader fixes for the
     `harness_disconnected` and `attention` kinds, the voice version, and the reader-only fields.
6. **The staging proof:**
   - a decision event reaches the hub by the relay;
   - a record event reaches SuperLibrary by the direct push on the new envelope;
   - a gate is decided from chat by the headless client;
   - a turn streams to SuperMessage's core under the vendored schemas.
7. **The cleanup change:** SuperPipeline stops sending `X-Superpipeline-Signature`.

---

## Task 1 (treaty): SuperPipeline's event contracts

**Files:**

- Create `schemas/superpipeline/work.available.v1.json`: `{event:"work.available", boardId,
cardId, stageKey, ts}`.
- Create `schemas/superpipeline/cards.stale.v1.json`: `{event:"cards.stale", boardId, boardName,
cards: StaleCardView[], ts}`.
- Add both, with their cases, to `fixtures/superpipeline-events/examples.json`.
- Add both to `schemas/catalog.json`.
- Create `schemas/http/superpipeline/push.v1.openapi.json` for push registration:
  - the agent route `POST /v1/boards/{boardId}/push-configs` (`claim` scope; body `{url, token,
capabilities?, events?}`);
  - the service route (`push:write`, `approval-requests:relay`; body `{url, token, events}`);
  - upsert on `(agent, url)`, `201 {configId}`.
- Create `fixtures/cloudevents/push-delivery.json`: signed delivery vectors for the direct push
  on the relay's envelope. Each vector pairs a secret with its expected `x-treaty-signature` over
  `t.id.body`.
- Write the receiver status contract (ruling 4) in `schemas/README.md` and
  `apps/relay/README.md`.
- `superpipeline.direct-push` becomes `contracted`.

## Task 2 (treaty): the relay keeps its own promises

- **A delivery timeout.** `apps/relay/src/deliver.ts`'s `deliverOne` times out after 10 s
  (`AbortSignal` with a timer), below `ack_wait`. A test shows a hung subscriber is retried, not
  delivered to twice at once.
- **The status contract is tested.** 503 retries, 409 drops, and a timeout retries.

## Task 3 (treaty): AgentPod's Matrix activity

Create `schemas/matrix/` files, one per shape, each carrying `x-treaty-carrier`:

- `dev.agentpod.turn.v1.json`
- `dev.agentpod.stream.delta.json`
- `dev.agentpod.thought.delta.json`
- `dev.agentpod.tool.update.json`
- `dev.agentpod.turn_error.json` (the key's value)
- `dev.agentpod.voice_transcript.json`
- `dev.agentpod.voice_reply.json`

Their fields come from AgentPod's zod schemas and builders. Enums are open, with
`x-treaty-known-values`.

Cases go in `fixtures/matrix-events/examples.json`, including:

- the Hermes producer's shapes: a turn id as `session_id`, `tc-…` ids, no `pending`;
- a higher `schema_version`, accepted.

`agentpod.matrix-activity` becomes `contracted`.

## Task 4 (treaty): Live Activity

**Files:**

- `schemas/common/matrix-error.v1.json` and its cases. The envelope is added to
  `x-treaty-error-envelope`'s allowed set, and the Matrix `errcode`s join `contracts/error-codes.json`
  under owner agentpod.
- `schemas/http/agentpod/live-activity.v1.openapi.json`: `POST` and `DELETE`
  `/_supermessage/v1/live-activity/tokens`, with Matrix bearer auth through whoami, and 204, 400,
  401, 413, 502 and 503.
- `schemas/agentpod/fleet-content-state.v1.json`, which is strict for the producer.
- `schemas/agentpod/live-activity-payload.v1.json` for the `aps` payload.
- `fixtures/agentpod-live-activity/`: the two fleet fixtures as cases. The v2 fixture's
  `completed: 0, total: 0` is corrected to the shape the hub emits.

`agentpod.live-activity` becomes `contracted`.

## Task 5 (treaty): integrate and release

- Registry statuses and coverage. Exactly 53% is recorded in `scripts/registry.test.ts`.
- `CHANGELOG.md`.
- The docs site, with a page per new schema.
- Then the operator tags `v0.0.17`.

---

## Product tasks

Each is one pull request in its repository, with that repository's CI run locally before
pushing, pinned to `0.0.17`.

### SuperPipeline (producer; merges first)

1. **Per-event ids.** An event's id is `<boardId>:<seq>`, shared by every delivery row of that
   event, on both paths.
2. **The direct push uses the relay's envelope.** Binary-mode CloudEvents headers and
   `x-treaty-signature` are signed with the push config's token. `X-Superpipeline-Signature` is
   still sent beside it, and both are tested against treaty's vectors.
3. **Every pushed body is typed.** `WorkAvailableBody` and `StaleDigestBody` are named, and the
   existing push hook validates every body against treaty's schemas, the two new ones included.
4. **More on the relay.** Record events and `work.available` are relayed when a relay is set.
   `work.available` stays per-agent on the direct push.
5. **The push routes are contract-checked** against `push.v1`, by the existing HTTP hook.

### estate

- The hub's relay filter widens to every decision event.
- SuperDispatch's narrows to `evt.*.superpipeline.card.>`.
- Restart the relay on staging, then prod with the operator.

### AgentPod hub

1. **The relay is the decision path.** The relay route takes all 11 decision types through
   treaty's guards. Once the estate filter is widened, `pushEventsFor` drops them from the push
   subscription. The hand-written `isElicitationPending` goes, replaced by treaty's.
2. **Ruling 4:** an unknown board is 503, an invalid body is 400, and an unknown type is 200.
3. **The direct push receiver verifies `x-treaty-signature`,** and falls back to the old header
   until the cleanup.
4. **Producer tests validate every Matrix shape against treaty:**
   - the turn card, the deltas, the error card and the voice keys;
   - the Live Activity payload and `FleetContentState`;
   - the token routes against the OpenAPI document.

   The Hermes plugin's Go test validates the Python plugin's emitted bodies against the vendored
   schemas.

### SuperExchange, SuperDispatch, SuperLibrary

- **SuperExchange:** ruling 4.
- **SuperDispatch:** `card.ready` through `record`/`card.ready.v1`, and ruling 4.
- **SuperLibrary:**
  - record bodies through `record.v1`;
  - the event list from the schema, not a copy;
  - `x-treaty-signature` verified on its push, with the old header as fallback until the cleanup;
  - ruling 4: a board it has not mapped yet is 503, not 404.

### SuperMessage

1. **Vendored treaty data.** Data is vendored under `vendor/treaty/`. Its `treaty.json` consumes:
   - `superexchange.board-room`
   - `agentpod.harness-permission`
   - `accounts.identity-corpus`
   - `agentpod.matrix-activity`
   - `agentpod.live-activity`

   The `include_str!` and `project.yml` paths move. `check-treaty-corpus.sh` is replaced by
   `treaty verify`. It moves to 0.0.17, which picks up the strict `expires_at` cases.

2. **Readers follow the contract:**
   - add `harness_disconnected`, and `attention` on iOS;
   - voice readers draw higher `schema_version`s best-effort;
   - remove `reasoning`, `input` and `output`;
   - the Live Activity client checks the token and device bounds the hub enforces.
3. **Rust tests run every case** for each vendored Matrix and Live Activity schema through the
   real parsers.

### The staging chat client (estate tooling)

A small headless Matrix client with end-to-end encryption runs on the staging host as a staging
test person. It joins a board room and answers a gate card. The staging proof then covers a
decision made in chat.

## Review focus

1. **Two paths, one event.** A record event that arrives by both the relay and the direct push
   during the move is applied once, keyed on the shared event id.
2. **A standalone SuperPipeline.** With no relay configured, every event still reaches
   push-config subscribers, signed with `x-treaty-signature`.
3. **A newer card.** A `turn.v1` with `schema_version: 2` and an unknown tool status is drawn by
   SuperMessage, never dropped.
4. **A board a receiver has not mapped yet.** It answers 503 on the relay and is retried, rather
   than a 404 that is dropped.
5. **A delivery that hangs.** The relay times out after 10 s and redelivers; the receiver never
   handles it twice at once.
