# treaty: the plan

**Date:** 2026-11-02. Dated by the day it was written.
**Status:** Agreed in conversation on 2026-11-02. Work starts after the repository is mirrored
(see [Before step 1](#before-step-1)).
**Background:** the Events plane, the shared audit trail and governance policy were ruled on
2026-10-24: CloudEvents over NATS, open source, no vendor lock. The research behind this plan is
in the sketchbook (`ideas/2026-10-24-events-plane`, `ideas/2026-10-24-shared-audit-trail`). The
charter's [planes table](https://github.com/SuperJackfruitLabs/charter#the-planes) still lists
Events as unowned until a decision record says otherwise.

## What treaty is for

The [charter](https://github.com/SuperJackfruitLabs/charter) holds the agreements between
products in prose. treaty holds the parts that software must check, so that no single product is
the authority over a contract several products share. Today the shared fixture corpus lives in
AgentPod, and SuperPipeline honours one of its contracts by reimplementing it from a path in a
comment. treaty ends that.

It holds:

- **the event envelope:** a CloudEvents 1.0 codec;
- **event schemas:** JSON Schemas for every event type products exchange;
- **the identity fixture corpus**, moved from AgentPod;
- **outbox and consumer helpers** for publishing and receiving events exactly once in effect;
- **the relay** between Cloudflare Workers and NATS JetStream.

It does not hold any product's internals, and it does not hold prose decisions. Those stay in each
product and in the charter.

## Before step 1

- **Mirroring.** treaty exists only on GitHub (private). Forge needs either a read-only GitHub
  token to pull-mirror it, or forge becomes primary with a push mirror to GitHub over an SSH
  deploy key, as SuperToolkit, frontdoor, captain-jack and agentpod-connectors were set up on
  2026-10-30. To be decided before work starts. The same choice applies to `superdispatch` and
  `superexchange`.
- **Visibility, later.** AgentPod and SuperPipeline are public. A public product cannot depend on
  a private package and still pass the bare-machine test, because a stranger cannot fetch it.
  treaty holds contracts and no secrets, so it should be public by step 2, when the first public
  product starts consuming it. That is a decision for then, not now.

## Layout and tooling

- A TypeScript workspace on Bun, the toolchain the hub and accounts already use.
  - `packages/` for libraries.
  - `apps/` for the relay.
  - `fixtures/` and `schemas/` as plain data.
- **Go (the node agent, SuperToolkit) and Swift (SuperMessage) do not import TypeScript.** They
  validate against the same JSON Schemas and test vectors. Go uses the reference CloudEvents SDK,
  Swift has none and decodes the four required attributes itself.
- **Releases start at 0.0.1.**

## The steps

Each step lands as its own pull request in treaty. Where a step changes another repository, that
repository gets its own pull request. The producer always moves first, and an old shape is
removed only in a later, separate change.

| Step | What | Done when |
|---|---|---|
| **1. Scaffold** | Workspace, `packages/` and `apps/`, CI (format, typecheck, tests), and package publishing | CI is green on an empty package |
| **2. Move the fixture corpus** | Bring AgentPod's `fixtures/ecosystem-identity/` across with its history (31 commits), and publish it as a package | Every consumer checks against treaty's copy. See [Step 2's consumers](#step-2s-consumers) |
| **3. CloudEvents codec** | About 100 lines, binary mode, over NATS headers and HTTP, plus helpers for subjects and types (see [Naming](#naming)) | It passes conformance tests built from the Go SDK's test vectors |
| **4. First event schemas** | JSON Schemas for what SuperPipeline already sends: `gate.pending`, `elicitation.pending`, `gate.resolved`, its record events and run reports. Each event's `dataschema` points at its schema | SuperPipeline's current payloads validate, unchanged |
| **5. Outbox and consumer helpers** | Write the event in the same transaction as the change it records, on Durable Object SQLite and on Postgres. Consumers deduplicate on the CloudEvents `id` | Replaying the same event twice changes nothing |
| **6. Relay** (`apps/relay`) | Workers send events to it over HTTPS, and it publishes them to JetStream with `Nats-Msg-Id` set to the event `id`. A push consumer delivers events back to Workers over signed HTTP, with retries | estate deploys it next to NATS on staging, behind a public TLS hostname |
| **7. First real traffic** | SuperPipeline publishes gate events through the relay, and AgentPod consumes them. The existing direct push keeps running until this is proven | A gate decided in chat closes on the board through NATS, end to end on staging |

### Step 2's consumers

Counted on 2026-11-02 as files that reference `ecosystem-identity`, excluding Markdown:

| Repository | Files | Order |
|---|---|---|
| SuperPipeline | 17 | After treaty publishes |
| SuperMessage | 2 | After treaty publishes |
| accounts | 1 | After treaty publishes |
| AgentPod | its own tests | Moves last, then deletes its copy in a separate pull request |

Until AgentPod's copy is deleted, a drift check fails CI if the two copies differ.

### Naming

- **Subjects:** `evt.<workspace>.<product>.<entity>.<verb>`, for example
  `evt.ws_123.superpipeline.card.completed`. Tenancy and filtering work on prefixes.
- **Types:** `com.superjackfruit.<product>.<entity>.<verb>.v1`.
- **Versions live in `type` and `dataschema`, never in subjects**, so a consumer can filter across
  versions. A breaking change publishes `.v2` beside `.v1` for a deprecation period.
- **Two JetStream streams:** one for work events and one for audit, so a slow audit consumer never
  holds up work and a purge of work events never touches audit.

## What depends on treaty, outside it

These steps are in other repositories and follow treaty's steps:

| Repository | Change | After treaty step |
|---|---|---|
| estate | NATS JetStream on staging, its public TLS hostname, the two streams, and the relay | 6 |
| SuperPipeline | Publish its existing events through the relay, then drop the direct push | 6, then 7 |
| AgentPod | Consume gate events from NATS without breaking on duplicates | 7 |

## Later, not in this plan

- **The audit event schema**, shaped like OCSF 1.9, comes with the shared-audit-trail phase.
- **The Cedar policy schema** comes with the governance-policy phase.
- **The SuperExchange event contract.** AgentPod's `packages/contract` and `names.ts` move here
  when gate projection moves out of the hub into SuperExchange.

## Not decided here

- Where packages are published: Forgejo's package registry, GitHub Packages, or npm once public.
- How the relay authenticates senders, hosted and self-hosted. Hosted can verify accounts tokens.
  Self-hosted cannot depend on our hosted service.
- Retention periods for the two streams.
