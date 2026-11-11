#!/usr/bin/env bash
# Deploy a release of the relay to production, as root on the production host: run by the host's
# prod-deploy forced command (`treaty v<x.y.z>`, estate provision/302-prod-deploy.sh), which runs
# this file as it is at the tag. Idempotent. Builds the relay image for the tag, recreates the
# relay and the sink (NATS and its stream data stay), and runs the smoke. If the new release does
# not come up healthy and pass the smoke, the release that was running before is put back.
set -euo pipefail
tag=${1:?usage: release.sh v<x.y.z>}
repo=/opt/treaty
env=/etc/treaty
for f in relay.env sink.env smoke.env; do
  [ -f "$env/$f" ] || { echo "no $env/$f (estate provision/311-prod-relay.sh mints it)"; exit 1; }
done

cd "$repo"
git fetch -q --tags origin
prev=$(cat "$env/deployed" 2>/dev/null || true)
compose="docker compose -f deploy/production/compose.yml"

# Called inside `if`, where set -e does not apply, so every step returns on its own failure.
up() {
  git checkout -q --detach "refs/tags/$1" || return 1
  export TREATY_TAG=$1
  $compose build relay || return 1
  $compose up -d --force-recreate --remove-orphans nats relay sink || return 1
  for _ in $(seq 1 60); do curl -sf http://127.0.0.1:8797/healthz >/dev/null && break; sleep 1; done
  SMOKE_ENV=$env/smoke.env SMOKE_SUBJECT=evt.prod_smoke.treaty.smoke.ping SMOKE_SOURCE=/production/smoke \
    bash deploy/staging/smoke.sh http://127.0.0.1:8797 http://127.0.0.1:8796
}

if up "$tag"; then
  echo "$tag" > "$env/deployed"
  echo "released $tag ($(git rev-parse --short HEAD))"
  exit 0
fi
echo "release $tag failed its checks"
if [ -n "$prev" ] && [ "$prev" != "$tag" ]; then
  echo "putting $prev back"
  up "$prev" || echo "rollback to $prev failed too; the relay needs a person"
fi
exit 1
