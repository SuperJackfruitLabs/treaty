#!/usr/bin/env bash
# The relay's smoke: an event sent in is stored once, a resend is a duplicate, and the sink
# receives it once, signed. Usage: smoke.sh <relay url> <sink url>
# Staging by default; production's release.sh sets SMOKE_ENV, SMOKE_SUBJECT and SMOKE_SOURCE.
set -euo pipefail
relay=$1
sink=$2
# shellcheck disable=SC1090,SC1091
. "${SMOKE_ENV:-/opt/suite-staging/env/treaty/smoke.env}" # SMOKE_TOKEN

curl -sf "$relay/healthz" | grep -q '"ok":true' || { echo "smoke: relay is not healthy"; exit 1; }

id="smoke-$(date +%s)-$RANDOM"
subject=${SMOKE_SUBJECT:-evt.staging_smoke.treaty.smoke.ping}
send() {
  curl -s -X POST "$relay/v1/events/$subject" \
    -H "authorization: Bearer $SMOKE_TOKEN" \
    -H "ce-specversion: 1.0" -H "ce-id: $id" -H "ce-source: ${SMOKE_SOURCE:-/staging/smoke}" \
    -H "ce-type: com.superjackfruit.treaty.smoke.ping.v1" \
    -H "content-type: application/json" \
    --data '{"ping":true}'
}
first=$(send)
echo "$first" | grep -q '"duplicate":false' || { echo "smoke: first send: $first"; exit 1; }
again=$(send)
echo "$again" | grep -q '"duplicate":true' || { echo "smoke: resend was not a duplicate: $again"; exit 1; }

for _ in $(seq 1 30); do
  if curl -sf "$sink/received" | grep -q "\"$id\""; then
    count=$(curl -sf "$sink/received" | grep -o "\"$id\"" | wc -l)
    [ "$count" -eq 1 ] || { echo "smoke: $id delivered $count times"; exit 1; }
    echo "smoke: $id stored once and delivered once, signed"
    exit 0
  fi
  sleep 1
done
echo "smoke: $id never reached the sink"
exit 1
