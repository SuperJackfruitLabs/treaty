# treaty

The suite's contracts as code: the CloudEvents envelope, event schemas, the identity fixture
corpus, outbox helpers and the Workers↔NATS relay. The charter holds the prose agreements;
treaty holds what software must check. The plan is `docs/2026-11-02-treaty-plan.md`.

## Rules

- **Contracts only.** No product's internals and no prose decisions. A decision belongs in the
  charter, and treaty cites it.
- **The producer moves first.** A new event shape is published beside the old one. The old
  shape is removed in a later, separate change.
- **Versions live in `type` and `dataschema`, never in subjects.**
- **Go and Swift do not import TypeScript.** They validate against `schemas/` and the test
  vectors, so every contract must be expressible as data.
- **Every guard has a test that fails when the guard is reverted.**

## Layout

- `packages/`: TypeScript libraries, one per concern.
- `apps/`: deployable services (the relay, from step 6).
- `schemas/`: JSON Schemas, plain data.
- `fixtures/`: shared test corpora, plain data.

## Checks

`bun run check` runs what CI runs: format, typecheck, lint, tests. Run it before pushing.

## Hosting

Forge is primary and push-mirrors to GitHub. Open pull requests on forge only. CI and review
run on forge (`.forgejo/workflows`). Release and publishing jobs go in `.github/workflows` and
run only on GitHub, guarded with `if: github.server_url == 'https://github.com'`.

The repository is public. Never commit secrets or keys.

## Releases

- A `vX.Y.Z` tag on main publishes every non-private package in `packages/` to npm, under
  `@superjackfruitlabs/treaty-*`, at the tag's version (`.github/workflows/release.yml`). Only
  the operator pushes tags. Versions start at 0.0.1.
- `package.json` versions on main stay `0.0.0`. The tag is the only source of the version.
- npm trusts the workflow through OIDC, with provenance. No npm token is stored.
- A new package must be bootstrapped once by hand before the workflow can publish it. See the
  comment at the top of `release.yml`.

## Shared kit

`.forgejo/workflows/claude-review.yml`, the `claude-triage` job in `ci.yml`, and
`.github/claude/claude-ci.mjs` are copies of the shared claude-ci kit. Change the master and
sync; never edit a copy.
