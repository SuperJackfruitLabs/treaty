---
title: treaty-ecosystem-identity
description: "@superjackfruitlabs/treaty-ecosystem-identity: the identity fixture corpus every product checks its ids, token claims, prompts and chat events against."
---

[`@superjackfruitlabs/treaty-ecosystem-identity`](https://www.npmjs.com/package/@superjackfruitlabs/treaty-ecosystem-identity)
is the identity contract as plain JSON. Each product owns its own types; this corpus proves they
agree. **Use it** in the tests of anything that mints or checks a suite id, verifies an access
token, renders a card prompt or joins runs.

```ts
import grammar from "@superjackfruitlabs/treaty-ecosystem-identity/id_grammar.json" with { type: "json" };
import { CORPUS_FILES } from "@superjackfruitlabs/treaty-ecosystem-identity";
```

`CORPUS_FILES` lists every file, each published at its own subpath:

| File | What it pins |
| --- | --- |
| `id_grammar.json` | What each product mints and validates for every entity id, the full prefix registry, and the collisions in it, open and settled. |
| `token_claims.json` | The access-token claims every product verifies, in the organization plane's shape, with reject cases and one example token per kind of caller. |
| `card_prompt.json` | What a card becomes when it is handed to a harness. It pins the rendered text, not only the shape. |
| `run_join_key.json` | The run join key: SuperPipeline mints the work run, AgentPod executes it, and dispatched work has no competing run id. |
| `matrix_gate_events.json` | The chat events a gate, question, follow-up, waiting card or permission crosses Matrix on, with accept and reject cases. The [Matrix corpus](/fixtures/) is built from it. |

The corpus moved here from AgentPod on 2026-11-10, with its history. It depends on no type from any
product, so any product can read it. Every entity carries a `reject` list as well as valid
examples; see [Fixtures](/fixtures/#negative-cases-are-the-point).
