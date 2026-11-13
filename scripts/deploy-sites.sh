#!/usr/bin/env bash
# Build treaty.superjackfruit.com (docs-site/) and deploy it as a Cloudflare Worker with static
# assets.
#
# CI runs it on every merge to main that touches the site or what it is generated from
# (.github/workflows/sites.yml), with the organisation's CLOUDFLARE_API_TOKEN. It also runs by
# hand with a `wrangler login`. docs-site/wrangler.jsonc names the Worker and its custom domain, so
# this attaches the domain too.
#
# --config is explicit and wrangler runs from a scratch directory: in a site directory without a
# config, wrangler's project detection scaffolds an adapter into the site and rewrites
# astro.config.mjs. Other products learned that against the live account; do not simplify it away.
#
# Usage: scripts/deploy-sites.sh [docs]
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
which="${1:-docs}"
case "$which" in docs|all) ;; *) echo "usage: $0 [docs]" >&2; exit 2 ;; esac

command -v wrangler >/dev/null 2>&1 || {
  echo "wrangler is not installed. npm i -g wrangler, then wrangler login." >&2; exit 1; }

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

echo "==> building docs-site"
# The build generates the event pages from schemas/ and fixtures/, checks every claim against the
# repository, then builds. --force: the content layer caches into node_modules/.astro, and a stale
# store can report an empty collection while the dev server works fine.
(cd "$root/docs-site" && npm ci --silent && node scripts/generate.mjs && node scripts/check-claims.mjs && npx astro build --force)
echo "==> deploying docs-site"
(cd "$scratch" && wrangler deploy --config "$root/docs-site/wrangler.jsonc" --cwd "$root/docs-site")
echo "==> https://treaty.superjackfruit.com"
