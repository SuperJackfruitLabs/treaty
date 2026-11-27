# Contracts

Treaty's own records about the contracts it holds, as plain data.

## `registry.json`

Every place one suite product talks to another, listed whether or not treaty holds its contract.
A crossing nobody lists looks like no crossing, so the registry starts from what the products' code
does, not from what treaty already covers. It was seeded on 2026-11-22 by reading every product's
`main` ([the plan](../docs/2026-11-22-every-crossing-plan.md)).

Each entry, checked by `schemas/treaty/registry.v1.json`, has:

- **`id`**: `<owner>.<name>`.
- **`title`**.
- **`owner`**: the product that produces the crossing and authors its contract.
- **`consumers`**: every product that reads it.
- **`kind`**: `http`, `event`, `matrix`, `ipc`, `cli`, `file`, `token`, `mcp` or `telemetry`.
- **`status`**:

  | Status         | Meaning                                                       |
  | -------------- | ------------------------------------------------------------- |
  | `contracted`   | Every part of the crossing is in treaty.                      |
  | `partial`      | Some parts are; `gaps` says which are not.                    |
  | `uncontracted` | None are; `gaps` says what each side does instead.            |
  | `proposed`     | A contract is written here, and no product uses it yet.       |
  | `external`     | The contract lives in the owner's repository, not here.       |
  | `standard`     | A published standard covers it entirely; `standard` names it. |
  | `deprecated`   | Being retired; no new consumer may start using it.            |

- **`contract`**: the schemas and fixtures that make it up.
- **`cases`**: for each schema, where its valid and invalid cases are, as
  `<fixture path>#<JSON pointer>` to an object of `valid` (label → body) and `invalid`
  (`{ why, body }`).
- **`phase`**: the plan's phase that will contract it.
- **`evidence`**: where it lives in product code, as `<repo>:<path>`.

Every schema under `schemas/` belongs to at least one crossing. The exceptions are
`schemas/treaty/`, which describes treaty's own files, and `schemas/common/`, which holds pieces
other schemas reference.

**Coverage** is the share of crossings that are `contracted`, counting out `standard` and
`deprecated`. `scripts/registry.test.ts` records the current figure, so every change to it shows
up as a diff in review.

## `artifacts/`

Code one product ships to another as built files, such as SuperLibrary's JavaScript embed, which
treaty records by version and hash rather than by shape (phase 3, ruling 7). Each record, checked
by `schemas/treaty/artifact.v1.json`, names its crossing, where it is built, the version and
commit, each file's SHA-256, and each consumer's pin. Its crossing lists the record in `contract`;
the consumer's own pin stays where it is.

## `supertoolkit/`

`builtin-services.json`: the services stk compiles in (supertoolkit `internal/catalog`), checked by
`schemas/treaty/builtin-services.v1.json`. A forge service in the policy file may not take one of
these names; `schemas/supertoolkit/policy.v1.json` refuses it, and a test holds the schema's list
to this file.
