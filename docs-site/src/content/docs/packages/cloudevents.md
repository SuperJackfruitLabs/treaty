---
title: treaty-cloudevents
description: "@superjackfruitlabs/treaty-cloudevents: the CloudEvents 1.0 codec in binary mode over HTTP and NATS, the suite's subject and type names, and signed relay delivery."
---

[`@superjackfruitlabs/treaty-cloudevents`](https://www.npmjs.com/package/@superjackfruitlabs/treaty-cloudevents)
is the suite's event envelope. **Use it** in anything that sends an event, receives one, or
receives a delivery from [the relay](/relay/). It has no dependencies and runs in Workers, Bun and
Node.

```ts
import {
  eventSubject,
  eventType,
  toBinary,
  type CloudEvent,
} from "@superjackfruitlabs/treaty-cloudevents";

const name = { product: "superpipeline", entity: "gate", verb: "pending" };
const event: CloudEvent = {
  attributes: {
    specversion: "1.0",
    id: "brd_134a0ddb6d434478:42",
    source: "/superpipeline/boards/brd_134a0ddb6d434478",
    type: eventType(name, 1), // com.superjackfruit.superpipeline.gate.pending.v1
    datacontenttype: "application/json",
  },
  data: new TextEncoder().encode(JSON.stringify(body)),
};
const subject = eventSubject("ws_123", name); // evt.ws_123.superpipeline.gate.pending
const { headers, body: bytes } = toBinary(event, "http");
```

## What it exports

| Export | What |
| --- | --- |
| `CloudEvent` | An event: `attributes` (canonical strings, by name) and optional `data` (bytes). |
| `BinaryMessage`, `Binding` | A message on the wire (`headers`, `body`), and `"http"` or `"nats"`. |
| `toBinary()`, `fromBinary()` | Encode an event to a binary-mode message on a binding, and decode one. |
| `validate()` | Throw unless attributes are a valid CloudEvents 1.0 context. |
| `SPEC_VERSION`, `REQUIRED_ATTRIBUTES`, `RequiredAttribute` | `"1.0"`, and `id`, `source`, `specversion`, `type`. |
| `eventSubject()`, `parseSubject()` | Build and read `evt.<workspace>.<product>.<entity>.<verb>`. |
| `eventType()`, `parseType()`, `EventName` | Build and read `com.superjackfruit.<product>.<entity>.<verb>.v<N>`. |
| `signDelivery()`, `verifyDelivery()`, `SIGNATURE_HEADER` | Sign and check a relay delivery, in the `x-treaty-signature` header. |
| `percentEncode()`, `percentDecode()` | The header-value encoding both bindings use. |
| `CloudEventError` | What every function here throws. |

The rules each one applies are on [The envelope and subjects](/envelope/), and verifying a
delivery is on [The relay](/relay/#verifying-a-delivery).

Its test cases are plain data in `fixtures/cloudevents/binary-mode.json`, built from the Go SDK's
test events, so a codec in another language can run the same ones.
