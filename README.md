# treaty

The suite's contracts as code. The [charter](https://github.com/SuperJackfruitLabs/charter)
records the agreements between products in prose. treaty holds the parts of those agreements
that software must check, so no single product is the authority over a contract several
products share.

## What will live here

- **The event envelope:** a small CloudEvents 1.0 codec (binary mode), with conformance tests.
- **Event schemas:** JSON Schemas for each event type, including audit events.
- **The identity fixture corpus,** moved from AgentPod's `fixtures/ecosystem-identity/` once
  products consume it from here.
- **The relay** that lets Cloudflare Workers and Durable Objects publish to NATS JetStream and
  receive events by HTTP push.

## Status

Empty. Created on 2026-11-02. Nothing here is published or consumed yet.
The plan is in [docs/2026-11-02-treaty-plan.md](docs/2026-11-02-treaty-plan.md).

## Licence

[MIT](LICENSE)
