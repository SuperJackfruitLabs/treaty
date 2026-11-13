---
title: treaty-matrix-events
description: "@superjackfruitlabs/treaty-matrix-events: the board-room Matrix event contract as JSON Schemas, a valid and refused corpus, and the builders and parsers."
---

[`@superjackfruitlabs/treaty-matrix-events`](https://www.npmjs.com/package/@superjackfruitlabs/treaty-matrix-events)
is the board-room Matrix event contract: every event a board's work crosses chat on, as data and as
TypeScript, so the carriers (AgentPod's hub and SuperExchange) and SuperMessage check the same
rules. **Use it** if you post board cards into Matrix, read the answers people send back, or
render them.

- **`schemas/*.json`:** one JSON Schema per type, named by its type string. The contract for
  readers in any language. The [Matrix catalogue](/matrix/) has a page for each.
- **`examples.json`:** the corpus the schemas are checked against, with what refuses each invalid
  case. See [Fixtures](/fixtures/#the-matrix-corpus-says-what-refuses-each-case).
- **TypeScript:** builders that take the bodies SuperPipeline sends and return Matrix content, and
  parsers that take a person's answer and return what a carrier acts on.

```ts
import { gateV2Content, parseGateDecision } from "@superjackfruitlabs/treaty-matrix-events";
import gateV2 from "@superjackfruitlabs/treaty-matrix-events/schemas/dev.superpipeline.gate.v2.json" with { type: "json" };
```

Nothing in it touches a database, a homeserver or a log. Judging an answer against what was
posted, and acting on it, stay with the carrier.

## Some of what it exports

| Export | What |
| --- | --- |
| `gateV2Content()`, `questionV2Content()`, `deliveryV2Content()`, `attentionV2Content()` | Build a card's Matrix content from what SuperPipeline sent. |
| `parseGateDecision()`, `parseQuestionAnswer()`, `parseDeliveryAnswer()`, `parseAttentionAnswer()` | Read a person's answer into what a carrier acts on, or `null`. |
| `isGatePending()`, `isElicitationPending()`, `isDeliveryPending()`, `isAttentionPending()` | Check a SuperPipeline body before building from it. |
| `isSubjectExpiry()` | The strict RFC 3339 rule for a subject's `expires_at`, the same as the schemas' `pattern`. |
| `uniqueByViolations()` | Check the `x-uniqueBy` rules JSON Schema cannot state. |
| `boardRoomNames()` | The board room's alias and speaker for a carrier: `agentpod` or `superexchange`. |

## The rules it keeps

- **Type strings never change.** A breaking change is a new type (`.v2` to `.v3`) beside the old
  one; an additive change bumps `schema_version` inside the content. See
  [Versioning](/versioning/).
- **A subject's `expires_at`** (on gate.v2, question.v2, delivery.v2 and permission.v2) is an RFC
  3339 date-time with seconds and an explicit offset, or null. The schemas carry both `"format":
  "date-time"` and a `pattern`, because a validator need not assert `format`.
- **`x-uniqueBy`** lists the paths whose values must not repeat: `options[].id` is the `id` of every
  option.
