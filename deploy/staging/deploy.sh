#!/usr/bin/env bash
# Deploy a commit of the relay to the staging plane, as root on workbench: run by
# /usr/local/sbin/staging-deploy (`treaty <sha>`). Idempotent. Builds the relay image for that
# commit, recreates the relay and the sink (NATS and its stream data stay), and runs the smoke.
set -euo pipefail
sha=${1:-$(git -C /opt/suite-staging/treaty rev-parse origin/main)}
cd /opt/suite-staging/treaty
git fetch -q origin
git checkout -q --detach "$sha"
sha=$(git rev-parse HEAD)

env=/opt/suite-staging/env/treaty
for f in relay.env sink.env smoke.env; do
  [ -f "$env/$f" ] || { echo "no $env/$f (estate provision/310-staging-relay.sh mints it)"; exit 1; }
done

export TREATY_SHA=$sha
compose="docker compose -f deploy/staging/compose.yml"
$compose build relay
$compose up -d --force-recreate --remove-orphans nats relay sink
for _ in $(seq 1 60); do curl -sf http://127.0.0.1:8798/healthz >/dev/null && break; sleep 1; done
bash deploy/staging/smoke.sh http://127.0.0.1:8798 http://127.0.0.1:8799
git log -1 --format='staged %h %s'
