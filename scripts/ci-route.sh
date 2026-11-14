#!/bin/sh

# Decide whether a Forge CI run may skip the application suite. This script is
# intentionally fail-closed: anything other than a non-empty, known diff made
# entirely of documentation paths runs the full suite.
set -eu

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT must name the Forge Actions output file}"

base=""
case "${EVENT:-}" in
  pull_request)
    if [ -n "${PR_BASE:-}" ]; then
      base="$(git merge-base "$PR_BASE" HEAD 2>/dev/null || true)"
    fi
    ;;
esac

app=true
docs=true
files=""
if [ -n "$base" ]; then
  files="$(git diff --name-only "$base" HEAD 2>/dev/null || true)"
  docs_path='^(README$|README\.(md|markdown|txt|rst)$|docs/|docs-site/)'
  if [ -n "$files" ] && ! printf '%s\n' "$files" | grep -qEv "$docs_path"; then
    app=false
  fi
fi

{
  echo "app=$app"
  echo "docs=$docs"
} >> "$GITHUB_OUTPUT"
printf 'base=%s app=%s docs=%s\n' "${base:-none}" "$app" "$docs"
