# treaty

The suite's contracts as code. The [charter](https://github.com/SuperJackfruitLabs/charter)
records the agreements between products in prose. treaty holds the parts of those agreements
that software must check, so no single product is the authority over a contract several
products share.

## What will live here

- **The event envelope:** a small CloudEvents 1.0 codec (binary mode), with conformance tests.
- **Event schemas:** JSON Schemas for each event type, including audit events.
- **The identity fixture corpus** (`fixtures/ecosystem-identity/`), moved from AgentPod with
  its history: the id grammar, token claims, the card prompt, the run join key and the chat
  events a gate, question or permission crosses Matrix on.
- **The relay** that lets Cloudflare Workers and Durable Objects publish to NATS JetStream and
  receive events by HTTP push.

## Packages

| Package                                                                                                                        | What it holds                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| [`@superjackfruitlabs/treaty-cloudevents`](https://www.npmjs.com/package/@superjackfruitlabs/treaty-cloudevents)               | The CloudEvents 1.0 envelope: binary mode over HTTP and NATS, and the suite's subject and type names                             |
| [`@superjackfruitlabs/treaty-ecosystem-identity`](https://www.npmjs.com/package/@superjackfruitlabs/treaty-ecosystem-identity) | The identity fixture corpus, as plain JSON                                                                                       |
| [`@superjackfruitlabs/treaty-event-schemas`](https://www.npmjs.com/package/@superjackfruitlabs/treaty-event-schemas)           | JSON Schemas for SuperPipeline's `gate.pending`, `elicitation.pending` and record events, and the catalogue of CloudEvents types |

Packages are published to npm from GitHub Actions, with provenance, when a `vX.Y.Z` tag is
pushed. The plan is in [`docs/2026-11-02-treaty-plan.md`](docs/2026-11-02-treaty-plan.md).

## Status

Scaffolded on 2026-11-10. The fixture corpus moved here the same day and every product reads it
from the package. The CloudEvents codec and the first event schemas followed.

## Licence

[MIT](LICENSE)
