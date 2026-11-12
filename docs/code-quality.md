# Code quality ratchets

> **Checked.** Every number below is held by a script or a test that fails when it is wrong.
> This page explains them; the numbers themselves live in the files it cites.

Each check records how the code looks today and fails if it gets worse. Each one also fails if
it gets **better** without the record being lowered, so a stale record cannot let the next
regression through. Both run in the required `check` job of `.forgejo/workflows/ci.yml`, as the
`Lint` and `Test` steps, and in `bun run check`.

## Lint: `bun run lint`

[oxlint](https://oxc.rs) `1.88.0` with `oxlint-tsgolint` `7.0.2004`, both pinned exactly in the
root `package.json` (a test fails if either pin moves). tsgolint type-checks with its own
TypeScript-Go, so it does not depend on the repo's TypeScript. Configuration:
[`.oxlintrc.json`](../.oxlintrc.json). Script: [`scripts/lint.mjs`](../scripts/lint.mjs).

- **Covers** `packages/`, `apps/`, `scripts/` and `deploy/`. Built `dist/` folders and
  `node_modules` are left out.
- **Rules:** the `correctness` and `suspicious` categories, plus floating and misused promises,
  `await` of a non-promise, exhaustive `switch` (a `default` counts), type-only imports, no
  `any`, no `!` non-null assertion, no empty block (an empty `catch` included), unused code, and
  no `console` outside scripts, tests, `deploy/` and the relay (`apps/relay/src` logs to stdout
  on purpose: that is how its container's log is read).
- **The ratchet.** Findings are counted per rule in
  [`scripts/lint-baseline.json`](../scripts/lint-baseline.json). A count may fall but never
  rise; a rule not in the baseline must be clean. After a cleanup, `bun run lint --update`
  writes the lower counts (it refuses to raise one); lint fails until you do.
- **Shipped source stays clean** of the rules in `SRC_CLEAN` in `scripts/lint.mjs`, whatever the
  baseline allows in tests and scripts. "Shipped" means under `packages/*/src/` or
  `apps/*/src/` and not a test file. When a baseline rule has no finding left in shipped source,
  lint fails until the rule joins `SRC_CLEAN`, so a rule that reaches zero there stays at zero.
- **Before running it:** `bun install --frozen-lockfile`. Without it the typed rules cannot load
  the project and report `tsconfig-error`, which the baseline does not allow.

The bulk of the baseline is `!` assertions and unchecked type assertions. They are held, not
cleared: rewriting them wholesale risks changing behaviour. Lower them in code you touch.

The one `Array#sort()` left is in `packages/outbox/src/sqlite.ts`. `toSorted()` would give the
same result, but it is published code and `toSorted()` would raise the runtime its consumers
need, so it is left for a change that decides that.

There is no Go in this repository, so there is no Go lint.

## Architecture: `scripts/architecture.test.ts`

Run by `bun test`. It holds:

- **no runtime import cycle** between files (`LARGEST_CYCLE`, 0). `import type` and
  `export type` are erased at run time and do not count;
- **no code file over 1,000 lines** (`SIZE_LIMIT`), except those held at their current size in
  `OVERSIZE`, which is empty. An entry whose file shrinks fails until it is lowered;
- **the layer order** (`LAYERS`, below): the parts of the repository import each other only
  downwards, never across a layer. A new package, app or top-level code folder fails the test
  until it is given a layer;
- **a published package's `src/` imports nothing outside the package.** npm ships the package's
  own files only, so a relative import into another package would break the published build.

### The layers

Lowest first. Read from the imports on 2026-11-13, not designed: this is the order the code
already had.

| Layer | Parts                                                                                                     | Imports                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1     | `packages/cloudevents`, `packages/ecosystem-identity`, `packages/event-schemas`, `packages/matrix-events` | nothing in the repository                                                       |
| 2     | `packages/outbox`                                                                                         | `cloudevents`, from its tests only (the `CloudEvent` type)                      |
| 3     | `apps/relay`                                                                                              | `cloudevents`                                                                   |
| 4     | `scripts`, `deploy`                                                                                       | the packages (the corpus builders, the repository-wide tests, the staging sink) |

Nothing imports `scripts/` or `deploy/`, and they do not import each other. When a lower layer
needs something from a higher one, do not reorder the table to fit: move the pure helper or type
down to where it is needed, or declare a narrow interface in the lower part and pass the
implementation in where the pieces are put together.

## Practices

- **Characterize before restructuring.** Before code moves, pin what it does that no test pins:
  its exports, its output byte for byte. Commit the pin on its own against the old code, and see
  it fail against a change planted in the old code. `scripts/matrix-examples.test.ts` is the
  example: it holds the corpus file the builder writes as bytes, where the older corpus test
  compared data and let a reordered key through.
- **Move, then fix.** A split moves code verbatim and exports only what crosses the new
  boundary. Behaviour changes, even obvious improvements, go in their own change.
- **A published package's exports do not change in a restructure.** Compare the runtime export
  list of each `src/index.ts` and the built `dist/` before and after.
- **A lint finding is fixed, not hidden.** Where a rule is wrong about a line, disable it for
  that line only, with `// oxlint-disable-next-line <rule> -- <why>`.
- **Every guard has a test that fails when the guard is reverted.** `scripts/lint.test.ts` and
  the last test of `scripts/architecture.test.ts` feed each rule a planted case.
