---
title: Status
description: "Where Treaty stands: v0.0.13, what ships in it, what is not decided yet, and what is still to come."
---

**Current version: v0.0.13**, released 2026-11-12. Treaty is early and moves quickly; every release
is in the [changelog](https://github.com/SuperJackfruitLabs/treaty/blob/main/CHANGELOG.md) and on the
[GitHub releases page](https://github.com/SuperJackfruitLabs/treaty/releases).

## What ships

- **Five packages on npm**, all at 0.0.13: [`treaty-cloudevents`](/packages/cloudevents/),
  [`treaty-event-schemas`](/packages/event-schemas/), [`treaty-matrix-events`](/packages/matrix-events/),
  [`treaty-ecosystem-identity`](/packages/ecosystem-identity/) and [`treaty-outbox`](/packages/outbox/).
- **The event schemas** for what SuperPipeline sends; the newest, `card.ready` v1, arrived in
  v0.0.13. The [event catalogue](/events/) lists every type.
- **The board-room Matrix contract**: a schema per event type, its corpus, and the builders and
  parsers moved from AgentPod's hub. The [Matrix catalogue](/matrix/) lists every type.
- **[The relay](/relay/)**, in production since v0.0.7, deployed by each version tag.

## Who uses it

SuperPipeline publishes its board-chat events and `card.ready` through the relay. SuperExchange
and AgentPod's hub carry the board-chat events into Matrix, SuperDispatch reacts to `card.ready`
and nudges, SuperMessage renders the Matrix cards, and the products that mint or verify ids and
tokens check against the identity corpus.

## Not decided yet

- **How the relay authenticates producers.** A bearer token per producer is what it does today.
- **How long the relay's streams keep events.** The defaults are placeholders.

## Not here yet

- **An audit event schema**, with the shared audit trail. The relay already keeps an `AUDIT`
  stream for `audit.>` subjects.
- **A policy schema**, with governance policy.
- **Schemas for `work.available` and `cards.stale`**, which SuperPipeline sends to an agent's own
  endpoint.
- **Record events through the relay.** SuperPipeline's record events (`card.*`, `gate.resolved`,
  links) have a schema but go only by its direct push.

Run reports are not missing: SuperWitness owns their schema and publishes it.
