---
title: The Go module
description: "github.com/SuperJackfruitLabs/treaty: every contract treaty holds, embedded in a Go module, with a validator and a case runner for your own types."
---

`github.com/SuperJackfruitLabs/treaty` is treaty's data as a Go module: every JSON Schema, OpenAPI
document, fixture corpus and registry file at its treaty path (`schemas/…`, `fixtures/…`,
`contracts/…`). It is released by the same `vX.Y.Z` tag as the npm packages, so a Go product pins
the same release and gets the same files, byte for byte, with no copies to keep in sync.

```sh
go get github.com/SuperJackfruitLabs/treaty@v<version>
```

The module carries no generated types. Keep your own structs, and prove them against treaty's
corpus with `RunCases()`.

## What it exports

| Name | What it does |
| --- | --- |
| `Validate()` | Checks a value against a schema treaty holds. `nil` means it holds. |
| `RunCases()` | Feeds every valid and invalid case of a contract to your parse function and returns each one it read the other way. |
| `Manifest()` | The release's version and every JSON file's sha256, the same as the npm package's `data/manifest.json`. |
| `ReadFile()` | One file of the release, by treaty path. |
| `FS()` | The release's files as an `fs.FS`. |
| `ErrInvalid` | Wrapped by `Validate()`'s error when the schema refuses the value (`errors.Is`). Any other error means the reference could not be read. |
| `Mismatch` | One case your parse function read the other way: its `Case` (the label or the reason), what the corpus says it is (`Valid`), and your error (`Err`). |
| `ManifestFile` | The type `Manifest()` returns. |
| `ModulePath` | `github.com/SuperJackfruitLabs/treaty`, the path your `go.mod` requires. |

## Test your parser against the corpus

```go
import "github.com/SuperJackfruitLabs/treaty"

func TestGatePendingParser(t *testing.T) {
	for _, m := range treaty.RunCases("schemas/superpipeline/gate.pending.v1.json", func(body []byte) error {
		_, err := ParseGatePending(body)
		return err
	}) {
		t.Error(m)
	}
}
```

`RunCases()` reads the cases where `treaty cases` reads them: where the registry names a schema's
cases, else `fixtures/<path>.cases.json` beside it. For an HTTP API, address one operation's body
as `<document>#<operationId>/request` or `#<operationId>/<status>`; an operation with no
`operationId` is keyed `METHOD /path`, as in the cases file:

```go
treaty.RunCases("schemas/http/agentpod/fleet.v1.openapi.json#listDispatchableAgents/200", parse)
```

A reference that holds no cases returns one `Mismatch`, so a typo never passes. A Matrix case marked
`refusedBy: "recorded"` is left out: it contradicts an event the reader recorded earlier, and is
valid on its own.

## Validate at the boundary

```go
if err := treaty.Validate("schemas/common/error.v1.json", body); err != nil {
	return fmt.Errorf("refused: %w", err)
}
```

The reference is a schema's treaty path, a path with a JSON pointer
(`schemas/http/x.v1.openapi.json#/components/schemas/Card`), an OpenAPI operation's body as above,
or a schema's full `$id`. A `[]byte` or `json.RawMessage` value is JSON text; anything else is
encoded with `encoding/json` first, so a struct is checked as it would travel.

Validation is JSON Schema 2020-12 through
[`santhosh-tekuri/jsonschema`](https://github.com/santhosh-tekuri/jsonschema), with formats
asserted and `pattern` read as an ECMA-262 regular expression, as the TypeScript package reads
them. Every `$ref` resolves from the embedded data; nothing is fetched. The module's own tests run
every case in the corpus through `Validate()` and check it is read as labelled.

## Declare it in treaty.json

A Go product lists its `go.mod` files in `goModules` instead of vendoring files:

```json
{
  "product": "agentpod",
  "treaty": "<version>",
  "produces": [],
  "consumes": ["superpipeline.events"],
  "goModules": ["node-agent/go.mod"]
}
```

[`treaty verify`](/packages/contracts/) then checks that each one requires
`github.com/SuperJackfruitLabs/treaty` at exactly `v<version>` and has no `replace` for it
(`go-module-unpinned`, `go-module-replaced`, `go-module-missing`). The Go checksum database pins
the module's bytes, so there is nothing else to compare.
