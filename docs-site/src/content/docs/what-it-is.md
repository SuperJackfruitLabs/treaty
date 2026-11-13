---
title: What Treaty is
description: "Treaty holds the contracts between the suite's products as code and data: it defines, the products carry, and it holds no product's data."
---

Treaty is the suite's contracts as code. When two products agree on the shape of something that
crosses between them (an event, a chat card, an id, a token's claims), that agreement lives here,
so no single product is the authority over a contract several products share.

The [charter](https://github.com/SuperJackfruitLabs/charter) records those agreements in prose and
decides them. Treaty holds the parts software must check, and cites the charter for the decision
behind each.

## It defines; the products carry

Treaty publishes definitions and nothing else:

- **[The envelope](/envelope/):** CloudEvents 1.0 in binary content mode, and the suite's names
  for event subjects and types.
- **[Event schemas](/events/):** a JSON Schema for each body SuperPipeline sends, and a catalogue
  that names each event's CloudEvents `type` and the `dataschema` it points at.
- **[Matrix event schemas](/matrix/):** one JSON Schema per board-room Matrix event, with the
  TypeScript that builds the content and parses the answers.
- **[Fixtures](/fixtures/):** shared corpora of valid and refused cases, including the identity
  corpus: the id grammar, token claims, the card prompt and the run join key.
- **[Outbox helpers](/packages/outbox/):** write an event in the same transaction as the change it
  records, and handle each incoming event once.
- **[The relay](/relay/):** the one deployable piece, which carries events between Cloudflare
  Workers and NATS JetStream.

Each product sends, receives, stores and renders on its own. SuperPipeline builds its own bodies
and validates them against these schemas in its own tests; SuperMessage renders the Matrix cards
from its own Rust code and checks it against the corpus; AgentPod and SuperExchange post and read
chat with the builders and parsers here. Treaty does not run any of that.

## It holds no product's data

Nothing in Treaty reads or writes a product's database, a homeserver or a log. The builders and
parsers in `treaty-matrix-events` are pure functions: judging an answer against what was posted,
and acting on it, stay with the carrier. The relay stores events in JetStream only long enough to
deliver them, and does not look inside their data.

## Plain data first

Go and Swift do not import TypeScript, so every contract is expressible as data. The schemas and
fixtures are plain JSON under `schemas/` and `fixtures/` in the repository, and the TypeScript
packages copy them in at build time. A reader in any language validates against the same files.

## What it is not

- **Not a product with users.** It has no app, no account and no hosted service of its own beyond
  the relay.
- **Not where decisions are made.** A decision belongs in the charter. Treaty cites it.
- **Not every contract yet.** See [Status](/status/) for what is still to come.

Treaty is MIT licensed. The source is on [GitHub](https://github.com/SuperJackfruitLabs/treaty) and
the packages are on [npm](https://www.npmjs.com/search?q=%40superjackfruitlabs%2Ftreaty).
