---
title: Versioning and compatibility
description: "How a contract changes without breaking anyone: readers ignore what they do not know, the producer moves first, both shapes are accepted, and the old one is removed last."
---

Your products release on their own schedules; we should not make two of them ship in lockstep just
to change a shared contract. Three rules let each side move safely in its own release.

## 1. Readers ignore what they do not know

No schema forbids extra properties. You may add an **optional** field without a new version, and
every reader must ignore a property it does not know. That gives the producer room to move first
without making an older reader fall over.

Removing or renaming a field, or changing what one means, is a breaking change and gets a new
version.

## 2. A new shape is published beside the old one

When the change is breaking, we never edit a schema in place. We publish the new shape beside the
old one:

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

We land every breaking change in three separate steps, each in its own release:

1. **The producer moves first.** Treaty publishes the new schema and the producer starts sending
   the new shape beside the old one.
2. **Readers accept both.** Each consumer learns the new shape while still reading the old one,
   on its own schedule.
3. **The old shape is removed last**, in a later, separate change, once no reader depends on it.

After those three releases, every reader has had a safe migration window and the catalogue no
longer needs to carry the retired shape.

## Package versions

All five packages publish together, at the version of the repository's `vX.Y.Z` tag. The tag is
the only source of the version: `package.json` files on main stay at `0.0.0`. Versions started at
0.0.1.

Pin an **exact** version in your product and move when you are ready. A new Treaty release changes
nothing for that product until you bump its pin; the tests against the new pin then tell you what
must change. See [Fixtures and pinned versions](/fixtures/).
