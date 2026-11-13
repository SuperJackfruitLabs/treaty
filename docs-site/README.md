# Treaty docs site

The documentation published at `treaty.superjackfruit.com`. Astro + Starlight.

```sh
npm ci
npm run dev     # http://localhost:4519
npm run build   # generates the event pages, checks the claims, then -> dist/
```

Astro 7 needs Node 22.23.4 or newer.

## Why npm, and why it sits outside the Bun workspace

The site has its own `package.json` and `package-lock.json`, so `bun install` never looks in here
and the packages' dependency tree carries nothing of Astro's. Nothing in `packages/` or `apps/`
imports it. `.prettierignore` leaves it out of the repository's format check.

## The catalogue is generated

`scripts/generate.mjs` writes one page per schema before every build, under
`src/content/docs/events/` (the bodies SuperPipeline sends) and `src/content/docs/matrix/` (the
board-room Matrix events). Those folders are not committed; never edit them. Each page has the
CloudEvents types and subjects (from `schemas/catalog.json`) or how the Matrix event rides, who
sends and reads it, a field table read from the schema (types, required, descriptions, and
constraints such as patterns and limits), the schema's cross-field rules as written, and the
valid and refused cases from `fixtures/`.

Who sends and reads each schema is `src/data/parties.json`, kept by hand: the catalogue names the
producer of SuperPipeline's events and nothing in treaty names a consumer. Change it when a
product starts or stops reading an event.

## Claims are checked

`scripts/check-claims.mjs` runs after the generator and fails the build when a page says
something the repository does not back:

- every schema has its page, and every generated page has its schema; every schema has an entry
  in `parties.json`, and its producer is the catalogue's;
- every catalogue type is on its schema's page with its body `event` and subject, and every schema
  has valid and refused cases;
- every `com.superjackfruit.*` type and every `dev.superpipeline.*` or `dev.agentpod.*` Matrix type
  named on any page exists;
- every internal link, anchors included, lands on a page;
- the relay page's settings, defaults, status codes, retry backoff, ack wait, streams and
  signature format are the relay's and the codec's (`apps/relay/src/`,
  `packages/cloudevents/src/signature.ts`);
- the envelope page's required attributes, attribute names, subject and type forms are the
  codec's;
- every package has a page, every `name()` a package page names is one it exports, and
  `treaty-cloudevents` and `treaty-outbox` have every export of their entry point on their page;
- the current version on the status page and in `llms.txt` is the newest release in
  `CHANGELOG.md`, and every version a page names was released.

So CI builds the docs when `docs-site/` changes and when anything they are generated from or
checked against does (`.forgejo/workflows/ci.yml`).

## What is deliberate about it

**A neutral suite look.** Treaty is not a product with a colour, so the site wears the lab's ink
and paper and spends jackfruit amber sparingly (`src/styles/theme.css`, with the measured contrast
of every pairing). `public/favicon.svg` is the lab's mark, copied from frontdoor's
`packages/frame/src/brand/lab.svg`. It is not in frontdoor's product list.

**For agents**: `/llms.txt`, `/llms-full.txt` and `/llms-small.txt` (`starlight-llms-txt`), with
every generated page in the full file. Search is Starlight's Pagefind; the sitemap and the 404 page
are Starlight's.

## Publishing

A Cloudflare Worker with static assets named `treaty-docs`, configured by
`docs-site/wrangler.jsonc`. From the repository root:

```sh
scripts/deploy-sites.sh   # generates, checks, builds, then wrangler deploy --config docs-site/wrangler.jsonc
```

The custom domain is declared in the config, so a deploy also attaches it. CI runs it on merge to
main from the GitHub mirror (`.github/workflows/sites.yml`) with the organisation's Cloudflare token;
by hand it uses your `wrangler login`. `assets.not_found_handling: "404-page"` serves
`dist/404.html` with a real 404.
