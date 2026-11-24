---
title: Which package
description: "The six @superjackfruitlabs/treaty-* packages on npm, what each holds, and when to use it."
---

Treaty gives you six MIT packages, all published together at the version of each release (v0.0.21
today). Choose the boundary you need from the table below, then pin its exact version.

| You want to | Use |
| --- | --- |
| Send or receive a CloudEvent, build a subject or type, or verify a relay delivery | [`treaty-cloudevents`](/packages/cloudevents/) |
| Validate a SuperPipeline event body, or look up an event's type and `dataschema` | [`treaty-event-schemas`](/packages/event-schemas/) |
| Post or read a board-room Matrix event: a gate, question, follow-up, waiting card, notice or answer | [`treaty-matrix-events`](/packages/matrix-events/) |
| Check ids, token claims, the card prompt or the run join key against the shared corpus | [`treaty-ecosystem-identity`](/packages/ecosystem-identity/) |
| Write events in the same transaction as the change, and handle each incoming event once | [`treaty-outbox`](/packages/outbox/) |
| Check your repository against the contracts it produces and consumes, or validate a body against any schema or HTTP API treaty holds | [`treaty-contracts`](/packages/contracts/) |

```sh
npm install @superjackfruitlabs/treaty-cloudevents@0.0.21
```

That command gives your project the CloudEvents codec and types at the same version this page
documents; a later Treaty release will not move the pin underneath you.

Every package is an ES module with its TypeScript types. The data packages (`event-schemas`,
`matrix-events`, `ecosystem-identity`) export their JSON files by subpath, so a reader in another
language can take the same files from the package or from the
[repository](https://github.com/SuperJackfruitLabs/treaty).

Packages are published from GitHub Actions with npm provenance when a `vX.Y.Z` tag is pushed. Each
release's notes are on the [GitHub releases page](https://github.com/SuperJackfruitLabs/treaty/releases).
