# The Matrix event contract moves to treaty (SuperExchange step 2)

**Date:** 2026-11-11.
**Follows:** charter `decisions/2026-11-10-superexchange-owns-the-communication-server.md`,
decision 4 ("The Matrix event contract moves to treaty") and step 2 of its decision 7.
Also `decisions/2026-11-11-superexchange-takes-gates-from-the-event-relay.md`.

## Why

SuperExchange will speak in board rooms what the AgentPod hub speaks there today: gates, questions,
follow-ups, waiting cards, their answers and their receipts. Three products read or write those
events: the hub (and later SuperExchange) posts them and reads the answers, and SuperMessage draws
them and sends the answers. Today the shapes live in two places in AgentPod and are copied by hand
into SuperMessage's Rust core. A third writer would make that three copies.

## What moves, and what stays

**Moves (board-room events), type strings unchanged:**

| Family             | Types                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate               | `dev.superpipeline.gate` (v1 card), `dev.superpipeline.gate.v1`, `dev.superpipeline.gate.v2`, `dev.superpipeline.gate.decision.v1`, `dev.superpipeline.gate.decision.v2`, `dev.superpipeline.gate.outcome.v1`, `dev.superpipeline.gate.pull_back.v2`, `dev.agentpod.gate.progress.v2` |
| Question           | `dev.superpipeline.elicitation` (v1 card), `dev.superpipeline.question.v2`, `dev.superpipeline.question.answer.v2`                                                                                                                                                                    |
| Follow-up          | `dev.superpipeline.delivery.v2`, `dev.superpipeline.delivery.answer.v2`                                                                                                                                                                                                               |
| Waiting card       | `dev.superpipeline.attention.v2`, `dev.superpipeline.attention.answer.v2`, `dev.superpipeline.attention.outcome.v1`                                                                                                                                                                   |
| Timeouts and holds | `dev.superpipeline.decision.reminded.v1`, `dev.superpipeline.decision.escalated.v1`, `dev.agentpod.decision.released.v2`, `dev.agentpod.decision.pulled_back.v2`                                                                                                                      |
| Checks             | `dev.agentpod.checks.waiting.v2`, `dev.agentpod.check.failed.v2`, `dev.agentpod.check.overridden.v2`, `dev.superpipeline.check.override.v2`                                                                                                                                           |
| Permission         | `dev.agentpod.permission`, `dev.agentpod.permission.v1`, `dev.agentpod.permission.v2`, `dev.agentpod.permission.answer.v2`, `dev.agentpod.permission.outcome.v1`                                                                                                                      |
| Board rooms        | the board room's alias and name helpers                                                                                                                                                                                                                                               |

The sources are `agentpod/packages/contract/src/matrix-events.ts` (the v1 cards and the permission
request) and the hub's `services/board-chat/*-wire.ts` (every v2 envelope, its parser and its
builder).

**Stays in AgentPod:** agent puppeting's own events (`dev.agentpod.turn.*`, `stream.delta`,
`thought.delta`, `tool.update`, `turn_error`, `voice_transcript`, `voice_reply`) and station room
names. Puppeting stays AgentPod's (charter decision 1). The permission envelope moves because it is
decided in rooms like a gate and drawn by the same client code.

**SuperPipeline does not change.** It sends no Matrix events; the hub builds them from its push and
relay events.

## The package

`@superjackfruitlabs/treaty-matrix-events`, MIT, published with the others on a `v*` tag.

- **One schema per type**, written once as zod and emitted as JSON Schema (draft 2020-12) into
  `schemas/matrix/<type>.json`, the way `treaty-event-schemas` does for CloudEvents data.
- **A parser and a builder per type**, moved from the hub's wire modules with their behaviour, not
  re-imagined: what a parser accepts and refuses today is the contract. The hub's own tests for those
  modules move with them.
- **Plain data first.** Swift and Rust do not import TypeScript (treaty's rule), so the schemas and
  the corpus are the contract; the TypeScript parsers are one implementation of it.
- **A fixture corpus**, `corpus/<type>/{valid,invalid}/*.json`, each invalid case named for the rule
  it breaks. It is generated from the hub's existing tests and SuperMessage's Rust tests, so it starts
  as a record of what both already agree on, and every difference found while building it is a
  finding, reported, not silently picked.
- **Board-room names**: the alias and display-name helpers.

## Steps

| #   | Repo         | Change                                                                                                                                                                                                    | Done when                                                                                                 |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | treaty       | The package: schemas, parsers, builders, corpus, names.                                                                                                                                                   | Every corpus case passes its parser; CI checks the emitted JSON Schemas are current. Published as v0.0.8. |
| 2   | agentpod     | The hub's wire modules and `packages/contract` import from treaty; the local copies go. A test runs treaty's corpus through the hub's handlers.                                                           | Behaviour-identical: the hub suite passes unchanged apart from moved tests.                               |
| 3   | supermessage | The Rust core's tests read treaty's corpus at a pinned version (a vendored copy plus a drift check in CI) and must accept every valid case and refuse every invalid one. No runtime dependency on treaty. | The core passes the corpus; any disagreement is fixed on whichever side is wrong.                         |

A new npm package is published once by hand before `release.yml` can publish it (the comment at
its top), so step 1 ends with that bootstrap by the operator, then the tag. Each step is one PR. Nothing is deployed differently, so no production tag is needed until step 2
ships in an ordinary AgentPod release.

## Not decided here

- Whether SuperMessage ever generates Rust types from the JSON Schemas. A pinned corpus is enough to
  hold the two together; generation can come later.
- The v1 card shapes' retirement. They move as they are; dropping them is a separate change once no
  client draws them.
