#!/bin/sh
# The release's publish step (the .github/release/publish.sh hook): publishes every
# non-private package in packages/ to npm at the tag's version, with provenance, after checking
# that the Go module at the tag embeds the same files. npm trusts the
# release workflow through OIDC (trusted publishing, environment `npm`), so no token is stored.
# A version already on npm is skipped, so a re-run finishes what a failed run started.
#
# Bootstrap once per new package: publish it by hand, then add this repository's `release.yml`
# and the `npm` environment as its trusted publisher on npmjs.com.
set -eu
: "${TAG:?TAG is the release tag}"
npm install --global npm@11.19.0 --ignore-scripts
bun install --frozen-lockfile
bun scripts/release-version.ts "$TAG"
bun run build
# The Go module is published by this same tag (the Go proxy reads it from the GitHub mirror), so
# it must carry exactly the files and sha256s of the npm package's data/manifest.json.
TREATY_REQUIRE_PACKAGE_DATA=1 go test -count=1 -run TestManifestEqualsThePackageManifest .
for dir in packages/*/; do
  if [ "$(node -p "require('./${dir}package.json').private === true")" = true ]; then
    continue
  fi
  name=$(node -p "require('./${dir}package.json').name")
  version=$(node -p "require('./${dir}package.json').version")
  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "$name@$version is already on npm; skipping"
    continue
  fi
  (cd "$dir" && npm publish --provenance --access public --ignore-scripts)
done
