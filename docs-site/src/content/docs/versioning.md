---
title: Versioning and compatibility
description: "How a contract changes without breaking anyone: readers ignore what they do not know, the producer moves first, both shapes are accepted, and the old one is removed last."
---

Products release on their own schedules, so a contract must change without any two of them having
to ship together. Three rules make that work.

## 1. Readers ignore what they do not know

No schema forbids extra properties. A producer may add an **optional** field without a new
version, and every reader must ignore a property it does not know.

Removing or renaming a field, or changing what one means, is a breaking change and gets a new
version.

## 2. A new shape is published beside the old one

A breaking change never edits a schema in place:

- **CloudEvents:** the version is the type's `.v<N>` and the schema's file name.
  `com.superjackfruit.superpipeline.gate.pending.v1` and a future `.v2` would both be in the
  catalogue, each with its own `dataschema`. The subject does not change, so a subscriber's filter
  keeps catching both.
- **Matrix events:** a type string never changes. A breaking change is a new type beside the old
  one (`.v1` to `.v2`). An additive change bumps `schema_version` inside the content instead.

The gate is the worked example. `dev.superpipeline.gate.v2`, the decision envelope, was added
beside the v1 card rather than in place of it, and both are in the [Matrix catalogue](/matrix/)
today: `dev.superpipeline.gate.v1` and the embedded `dev.superpipeline.gate` card alongside the v2
event.

## 3. Producer first, accept both, remove last

Every breaking change lands in three separate steps, each in its own release:

1. **The producer moves first.** Treaty publishes the new schema and the producer starts sending
   the new shape beside the old one.
2. **Readers accept both.** Each consumer learns the new shape while still reading the old one,
   on its own schedule.
3. **The old shape is removed last**, in a later, separate change, once no reader depends on it.

## Package versions

All five packages publish together, at the version of the repository's `vX.Y.Z` tag. The tag is
the only source of the version: `package.json` files on main stay at `0.0.0`. Versions started at
0.0.1.

A product pins an **exact** version and moves when it is ready. A new treaty release changes
nothing for a product until it bumps its pin, and the tests it runs against that pin say what it
has to change. See [Fixtures and pinned versions](/fixtures/).
