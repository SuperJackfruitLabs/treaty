# @superjackfruitlabs/treaty-matrix-events

The board-room Matrix event contract: every event a board's work crosses chat on, as data and as
TypeScript. Moved from the AgentPod hub with its behaviour unchanged, so SuperExchange, the hub and
SuperMessage share one copy (treaty `docs/2026-11-11-matrix-contract-plan.md`).

- **`schemas/*.json`:** one JSON Schema (draft 2020-12) per type, named by its type string. The
  contract for readers in any language. `x-uniqueBy` lists the paths whose values must not repeat.
- **`examples.json`:** the corpus the schemas are checked against: valid content, and invalid
  content with what refuses it (`schema`, `unique`, or `recorded`: only the carrier, against what it
  recorded when it posted).
- **TypeScript:** builders that take the bodies SuperPipeline sends (`GatePendingDelivery`,
  `ElicitationPendingDelivery`, …) and return Matrix content, and parsers that take a person's answer
  and return what a carrier acts on. Nothing touches a database, a homeserver or a log; judging an
  answer against what was posted, and acting on it, stay with the carrier.

```ts
import {
  gateV2Content,
  parseGateDecision,
} from "@superjackfruitlabs/treaty-matrix-events";
import gateV2 from "@superjackfruitlabs/treaty-matrix-events/schemas/dev.superpipeline.gate.v2.json" with { type: "json" };
```

Type strings never change here. A breaking change is a new type (`.v2` → `.v3`) published beside
the old one; an additive change bumps `schema_version` inside the content, and readers ignore
properties they do not know.

The board-room names (`boardRoomAlias`, `boardSpeakerMxid`) are the names existing rooms have, in
the AgentPod appservice's namespace. `boardRoomNames(carrier)` gives each carrier its own set:
`agentpod` returns those same names, `superexchange` names inside SuperExchange's namespace.
