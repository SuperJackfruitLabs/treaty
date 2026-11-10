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

## Shared kit

`.forgejo/workflows/claude-review.yml`, the `claude-triage` job in `ci.yml`, and
`.github/claude/claude-ci.mjs` are copies of the shared claude-ci kit. Change the master and
sync; never edit a copy.
