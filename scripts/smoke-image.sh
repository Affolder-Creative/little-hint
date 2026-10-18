#!/usr/bin/env bash
set -euo pipefail
: "${LITTLE_HINT_IMAGE:?Supply the local image to test}"
export POSTGRES_PASSWORD=ci-smoke-only BETTER_AUTH_SECRET=ci-smoke-secret-at-least-32-characters
export SETTINGS_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
export APP_URL=http://localhost:3000 APP_PORT=0
project="little-hint-smoke-${RANDOM}-$$"
compose=(docker compose --env-file /dev/null -p "$project" -f compose.yaml -f compose.ghcr.yaml -f compose.local.yaml)
cleanup() {
  status=$?
  if (( status != 0 )); then "${compose[@]}" logs --no-color app worker db; fi
  "${compose[@]}" down --volumes --remove-orphans
  exit "$status"
}
trap cleanup EXIT
"${compose[@]}" up -d --wait --wait-timeout 180 app worker
"${compose[@]}" exec -T app node --input-type=module -e '
import assert from "node:assert/strict";
import sharp from "sharp";
assert.notEqual(process.getuid(), 0);
assert.equal((await fetch("http://localhost:3000/api/health")).status, 200);
const notices = await fetch("http://localhost:3000/third-party-notices.txt");
assert.equal(notices.status, 200);
assert.match(await notices.text(), /react/);
const png = await sharp({create:{width:2,height:2,channels:3,background:"#aa4d37"}}).png().toBuffer();
assert.equal((await sharp(png).metadata()).width, 2);
'
"${compose[@]}" exec -T worker node -e 'const fs=require("node:fs");if(Date.now()-Number(fs.readFileSync("/tmp/little-hint-worker-heartbeat","utf8"))>60000)process.exit(1)'
# Migrations must be repeatable on the same database.
"${compose[@]}" exec -T app node dist/server/cli.js migrate
