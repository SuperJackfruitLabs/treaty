---
title: treaty-contracts
description: "@superjackfruitlabs/treaty-contracts: every contract as data, validators for schemas and HTTP APIs, and the treaty CLI a product runs in CI."
---

[`@superjackfruitlabs/treaty-contracts`](https://www.npmjs.com/package/@superjackfruitlabs/treaty-contracts)
holds every contract treaty keeps, as data, and the tools to check against it. Use it when your
product produces or consumes a crossing between products and you want CI to prove both sides still
agree.

## Declare your product

Put a `treaty.json` at your repository's root:

```json
{
  "product": "superlibrary",
  "treaty": "<version>",
  "produces": ["superlibrary.api"],
  "consumes": ["superpipeline.direct-push"],
  "vendored": [{ "path": "contracts/record.v1.json", "source": "schemas/superpipeline/record.v1.json" }]
}
```

`<version>` is the treaty release you pin; this package first ships in the release after
v0.0.14. `produces` and `consumes` are crossing ids from
[the registry](https://github.com/SuperJackfruitLabs/treaty/blob/main/contracts/registry.json).
`vendored` lists treaty files you keep a copy of, for code that cannot read the package.

Then run, in any language's CI:

```sh
npx -y @superjackfruitlabs/treaty-contracts@<version> verify
```

`treaty verify` prints one coded line per problem and exits 1 when there is one. It checks that:

- the manifest is valid;
- every id is in the registry, and your product owns what it produces;
- the registry lists your product among the consumers of what it consumes;
- the pin is the installed release, and with `--latest <version>` that it is at most two releases
  behind (`--max-behind <n>` changes that);
- every vendored copy is byte-identical to the release. `treaty sync` rewrites them.
- every `go.mod` listed in `goModules` requires the [Go module](/packages/go/) at exactly the
  pinned release, with no `replace` for it. A Go product lists its `go.mod` there instead of
  vendoring files.

`treaty cases <schema path>` prints a schema's valid and invalid cases as JSON, so a Go, Rust,
Swift or Python test can run treaty's corpus through its own parser. For an HTTP API, add
`--operation <id> --part request` or `--part <status>`.

## Validate in TypeScript

The main entry has no filesystem code, so it runs in Workers. Build a bundle from the files you
import, or load the installed one in Node and Bun:

```ts
import { openApi, validateResponse, validatorFor } from "@superjackfruitlabs/treaty-contracts";
import { loadInstalledBundle } from "@superjackfruitlabs/treaty-contracts/node";

const bundle = loadInstalledBundle();
const gatePending = validatorFor(bundle, "schemas/superpipeline/gate.pending.v1.json");
gatePending(body); // { valid, errors }
```

| Export | What |
| --- | --- |
| `createBundle()` | A bundle from files you already hold: repository path → parsed JSON. |
| `loadInstalledBundle()` | The release this package ships, from `./node`. `loadBundle()` reads a treaty checkout instead. |
| `validatorFor()` | A validator for a schema, by path, path and JSON pointer, or `$id`. Never reaches the network; an unresolvable `$ref` is a refusal, not a throw. |
| `openApi()` | An HTTP API from `schemas/http/`, with its operations. |
| `matchRoute()` | The operation a method and path reach. A literal segment outranks a parameter. |
| `validateRequest()`, `validateResponse()` | A body against an operation's contract. A status the contract does not name is refused; an absent optional body is accepted. |
| `validateParameters()` | A request's path, query and header values against the operation's parameters, path-level ones included. URL text is converted to the schema's type first; parameters the contract does not name are ignored. |
| `routeParams()` | The operation a request reaches and its path values, decoded, ready for `validateParameters()`. |
| `readRegistry()`, `coverage()` | The crossing registry and the share of crossings under contract. |
| `compareSchemas()`, `compareOpenApi()` | The breaking changes between two versions of a contract. |
| `verify()`, `sync()` | What `treaty verify` and `treaty sync` run, from `./node`. |

`data/manifest.json` in the package records the release and the sha256 of every file it holds.
