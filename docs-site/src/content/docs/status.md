---
title: Status
description: "Where Treaty stands: v0.0.18, what ships in it, what is not decided yet, and what is still to come."
---

**Current version: v0.0.18**, released 2026-11-23. Treaty is early and moves quickly, so start here
when you need to know what is solid and what is still open. You can trace every release in the
[changelog](https://github.com/SuperJackfruitLabs/treaty/blob/main/CHANGELOG.md) and on the [GitHub
releases page](https://github.com/SuperJackfruitLabs/treaty/releases).

## What ships

- **Six packages on npm**, all published together at each release:
  [`treaty-cloudevents`](/packages/cloudevents/), [`treaty-contracts`](/packages/contracts/),
  [`treaty-event-schemas`](/packages/event-schemas/), [`treaty-matrix-events`](/packages/matrix-events/),
  [`treaty-ecosystem-identity`](/packages/ecosystem-identity/) and [`treaty-outbox`](/packages/outbox/).
- **HTTP contracts** as OpenAPI 3.1, with cases: SuperPipeline's agent work loop, decisions,
  approvals, push registration, board reads and placement; the Accounts API; AgentPod's Live
  Activity tokens, capability catalog, fleet list and run evidence; SuperLibrary's API.
- **SuperPipeline's MCP tools** as a tool catalog, **the suite's telemetry conventions**, and
  **the account-link URLs** as URL shapes: three forms, each plain data any language can read.
- **The event schemas** for what SuperPipeline sends; the newest, `work.available` and
  `cards.stale` v1, arrived in v0.0.17. The [event catalogue](/events/) lists every type.
- **The board-room Matrix contract**: a schema per event type, its corpus, and the builders and
  parsers moved from AgentPod's hub.
- **AgentPod's chat activity**: the turn card, the streaming deltas and the error and voice
  payloads, each schema naming how it travels. The [Matrix catalogue](/matrix/) lists every type.
- **[The relay](/relay/)**, in production since v0.0.7, deployed by each version tag.

## Who uses it

Here is how the current pieces meet in practice. SuperPipeline publishes its board-chat events and `card.ready` through the relay. SuperExchange
and AgentPod's hub carry the board-chat events into Matrix, SuperDispatch reacts to `card.ready`
and nudges, SuperMessage renders the Matrix cards, and the products that mint or verify ids and
tokens check against the identity corpus.

## Not decided yet

Two choices are deliberately still open; we would rather name the wet paint than invite you to lean on it:

- **How the relay authenticates producers.** A bearer token per producer is what it does today.
- **How long the relay's streams keep events.** The defaults are placeholders.

## Not here yet

These contracts are planned, but you cannot depend on them yet:

- **An audit event schema**, with the shared audit trail. The relay already keeps an `AUDIT`
  stream for `audit.>` subjects.
- **A policy schema**, with governance policy.
- **Salaam's station protocol** with AgentPod, and **SuperToolkit's managed protocols**, which
  are not enabled anywhere yet.
- **Packages for other languages.** Go, Rust and Swift readers vendor Treaty's data with
  `treaty sync` and check it with `treaty verify`; generated packages come later.

Run reports are the exception, not a missing Treaty contract: SuperWitness owns and publishes their schema.
