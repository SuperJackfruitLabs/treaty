#!/usr/bin/env bash
# The release gate's fallback (the .github/release/ci-check.sh hook): when the
# forge's CI result for the tag's commit cannot be read, the release runs what forge CI runs, at
# the tag, with a NATS server for the relay's tests.
set -euo pipefail
v=2.15.2
f="nats-server-v$v-linux-amd64"
curl -fsSL -o "/tmp/$f.tar.gz" "https://github.com/nats-io/nats-server/releases/download/v$v/$f.tar.gz"
echo "67cb8e10bc6f0c4b47f75a728529a20953dbae2a4f9a4a52ae8517d65ae303ff  /tmp/$f.tar.gz" | sha256sum -c
tar -xzf "/tmp/$f.tar.gz" -C /tmp
nohup "/tmp/$f/nats-server" -js -a 127.0.0.1 -p 4222 -sd /tmp/nats-store > /tmp/nats.log 2>&1 &
up=
for _ in $(seq 30); do
  if (exec 3<>/dev/tcp/127.0.0.1/4222) 2>/dev/null; then up=1; break; fi
  sleep 1
done
[ -n "$up" ] || { cat /tmp/nats.log; exit 1; }
bun install --frozen-lockfile
NATS_URL=nats://127.0.0.1:4222 TREATY_REQUIRE_NATS=1 bun run check
