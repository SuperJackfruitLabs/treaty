# Verification — Treaty docs voice rollout

## Verdict

**Publishable: false.**

The 13-page voice rollout now meets the approved page-kind and exact-material boundaries, and the
claims that can be checked in this repository match code, tests or configuration at PR base
`4bd7d7d08d813a80f9751d8cbd6f25f3feba122f`. Verification found and corrected seven additional
factual overclaims or omissions, and the required docs checks pass.

Two current deployment-state claims remain unverified: `status.md` says the relay is in production
and has been there since v0.0.7, while `relay.md` says it currently runs in both production and
staging. The public repository proves the configured main/tag deployment and rollback paths, not
what is live in private infrastructure. Publication becomes clear when either:

1. the operator supplies a pinned private-estate revision and file:line evidence for both current
   live-state claims; or
2. the pages are narrowed to the repository-verifiable claim that the workflows are configured to
   deploy main to staging and version tags to production, with rollback after a failed smoke check.

## What I checked

- Read all 13 hand-written published pages and the full claims ledger.
- Checked commands, routes, settings, defaults, fields, status codes, response classes, limits,
  versions, schemas, exports and behavioral statements against the base's source, tests and
  configuration.
- Confirmed the PR changes only the 13 pages, the claims checker and review/handoff documents; site
  setup, product code, configuration, schemas, fixtures and generated pages remain unchanged.
- Checked page-kind voice treatment: warm direct prose on reference pages, explicit outcomes after
  action-bearing examples, no running gag, and literal tables/code/warnings/recovery.
- Checked privacy: the pages add no private host, person, agent, team, credential value or customer
  material. Product names, loopback addresses and synthetic placeholders are the only identifiers.

The detailed page-to-source mapping is in
`docs/reviews/2026-11-15-docs-voice-treaty-rollout.md`.

## Corrections made in verification

1. `index.mdx` no longer promises a schema for every body SuperPipeline sends; it describes the
   schemas Treaty actually holds.
2. `what-it-is.md` receives the same bounded schema-coverage correction.
3. `packages/cloudevents.md` no longer says every export throws `CloudEventError`; it identifies
   the validation surfaces that use the error.
4. `packages/matrix-events.md` now describes subject-expiry validation as the schemas' combined
   `format` and `pattern` rule rather than the pattern alone.
5. `packages/outbox.md` scopes duplicate enqueue suppression to a row that is still pending. A
   successful drain deletes that row, so later repeats remain an at-least-once concern handled by
   `handleOnce()`.
6. `relay.md` no longer guarantees receipt by every matching subscriber; it describes signed
   delivery attempts and bounded retries.
7. `relay.md` now states that all other returned responses, including 3xx and other 4xx, are
   terminal. The old table omitted 3xx even though the implementation drops them.

Each correction is listed separately with old claim, new claim and base evidence in the ledger.
The claims checker now prevents the corrected schema-coverage, relay-response, receipt-guarantee,
`CloudEventError` and pending-row claims from silently regressing.

## Validation

- Docs `npm run check:claims`: **pass** — generated 12 event pages and 29 Matrix pages from 41
  schemas; checked 56 pages, 27 CloudEvents types, 29 Matrix types, 7 relay settings, 10 relay
  answers and 5 packages; current version v0.0.13.
- Required docs-only CI command, `npm ci && npm run build`: **pass** — 308 packages added, 309
  audited, 0 vulnerabilities; 57 pages built; Pagefind indexed 57 HTML files; sitemap generated.
- Root `bun run fmt:check`: **pass** — all matched files use Prettier code style.
- The build emitted only the existing non-failing Starlight warnings for the empty optional `i18n`
  collection and missing `docs → 404` content entry.

## Handoff

- Branch: `card/card_a86dc17f98014a3a`
- Brief: `press/brief.md`
- Verification: `press/verification.md`
- Claims ledger: `docs/reviews/2026-11-15-docs-voice-treaty-rollout.md`
- Pull request: https://forge.superjackfruit.com/SuperJackfruitLabs/treaty/pulls/30
