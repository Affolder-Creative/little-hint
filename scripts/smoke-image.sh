#!/usr/bin/env bash
set -euo pipefail
: "${LITTLE_HINT_IMAGE:?Supply the local image to test}"
export POSTGRES_PASSWORD=ci-smoke-only BETTER_AUTH_SECRET=ci-smoke-secret-at-least-32-characters
export SETTINGS_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
export APP_URL=http://localhost:3000 APP_PORT=0
project="little-hint-smoke-${RANDOM}-$$"
compose=(docker compose --env-file /dev/null -p "$project" -f compose.production.yaml -f compose.local.yaml)
cleanup() {
  status=$?
  if (( status != 0 )); then "${compose[@]}" logs --no-color app worker db; fi
  "${compose[@]}" down --volumes --remove-orphans
  exit "$status"
}
trap cleanup EXIT
# Exercise the upgrade on disposable data before testing the new definition.
# Both commands use the same project so existing users/uploads would stay put.
legacy=(docker compose --env-file /dev/null -p "$project" -f compose.yaml -f compose.ghcr.yaml -f compose.local.yaml)
"${legacy[@]}" up -d --wait --wait-timeout 180 app worker
"${legacy[@]}" exec -T app node --input-type=module <<'JS'
import { Client } from 'pg';
import { writeFile } from 'node:fs/promises';
const db = new Client({connectionString:process.env.DATABASE_URL});
await db.connect();
await db.query('CREATE TABLE deployment_smoke (value text NOT NULL)');
await db.query("INSERT INTO deployment_smoke VALUES ('existing-data')");
await db.end();
await writeFile('/data/uploads/.deployment-smoke', 'existing-upload');
JS
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
"${compose[@]}" exec -T app node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
assert.equal(process.env.APP_ENV, 'production');
const db = new Client({connectionString:process.env.DATABASE_URL});
await db.connect();
assert.deepEqual((await db.query('SELECT value FROM deployment_smoke')).rows,
  [{value:'existing-data'}]);
await db.end();
assert.equal(await readFile('/data/uploads/.deployment-smoke', 'utf8'), 'existing-upload');
console.log('Production Compose transition preserves database and uploads.');
JS
"${compose[@]}" exec -T worker node -e 'const fs=require("node:fs");if(Date.now()-Number(fs.readFileSync("/tmp/little-hint-worker-heartbeat","utf8"))>60000)process.exit(1)'
# Migrations must be repeatable on the same database.
"${compose[@]}" exec -T app node dist/server/cli.js migrate
