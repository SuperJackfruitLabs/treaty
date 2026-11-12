# Changelog

Each release publishes every public package in `packages/` to npm at the tag's version, and
deploys the event relay to production.

## Unreleased

- Releases run on the suite's shared release workflow: the tag gate reads forge CI's result for
  the tag's commit, the packages publish to npm before the relay deploys, a failed relay smoke
  check puts the previous release back, and every tag gets release notes on GitHub.

## v0.0.12 — 2026-11-12

- `treaty-event-schemas`: schemas for the board-chat events SuperPipeline pushes.
- `treaty-matrix-events`: a subject's `expires_at` must be a strict RFC 3339 date-time.

## v0.0.11 — 2026-11-12

- `treaty-matrix-events`: board-room names per carrier.

## v0.0.10 — 2026-11-11

- `treaty-matrix-events` holds rules SuperMessage already enforces: a subject's revision is a
  whole number, a decision card has at least one option, and a permission carries at most twenty
  options.

## v0.0.9 — 2026-11-11

- The relay's image copies every workspace package's manifest, so the relay builds and deploys
  again. This is the release that brought the relay in production up to date after v0.0.8.

## v0.0.8 — 2026-11-11

- New package `@superjackfruitlabs/treaty-matrix-events`: the board-room Matrix event contract,
  moved here so SuperExchange and SuperMessage check the same rules.
- The packages published; the relay's production deploy failed at this tag (fixed in v0.0.9).

## v0.0.7 — 2026-11-11

- The relay runs in production, deployed by a version tag. A release that fails its health and
  smoke checks puts the release before it back.

## v0.0.6 — 2026-11-10

- The relay: carries events from Workers to NATS JetStream and back, over signed HTTP. It runs on
  staging.

## v0.0.5 — 2026-11-10

- New package `@superjackfruitlabs/treaty-outbox`: write events in the same transaction as the
  change that caused them, and handle each incoming event once.

## v0.0.4 — 2026-11-10

- New package `@superjackfruitlabs/treaty-event-schemas`: the first event schemas, SuperPipeline's
  `gate.pending`, `elicitation.pending` and record events.

## v0.0.3 — 2026-11-10

- `treaty-cloudevents`: the CloudEvents codec, binary mode over HTTP and NATS, and the suite's
  event type and source names.

## v0.0.2 — 2026-11-10

- `treaty-ecosystem-identity`: token claims v9, with the organization plane's own copy merged into
  the corpus.

## v0.0.1 — 2026-11-10

- First release. The shared identity fixture corpus is published as
  `@superjackfruitlabs/treaty-ecosystem-identity`, and a version tag publishes every public
  package to npm with provenance.
