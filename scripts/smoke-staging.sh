#!/usr/bin/env bash
set -euo pipefail
: "${LITTLE_HINT_STAGING_IMAGE:?Supply the local image to test}"
export LITTLE_HINT_STAGING_IMAGE
export STAGING_APP_URL=https://staging.example.test
export STAGING_POSTGRES_PASSWORD=staging-smoke-only
export STAGING_AUTH_SECRET=staging-smoke-secret-at-least-32-characters
export STAGING_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
export STAGING_MAILPIT_UI_AUTH=operator:local-smoke-only
scratch=$(mktemp -d)
export STAGING_TLS_DIR="$scratch/tls"
project="little-hint-staging-smoke-${RANDOM}-$$"
compose=(docker compose --env-file /dev/null -p "$project" -f compose.staging.yaml)
cleanup() {
  status=$?
  if (( status != 0 )); then "${compose[@]}" logs --no-color app worker mailpit db; fi
  "${compose[@]}" down --volumes --remove-orphans
  rm -rf "$scratch"
  exit "$status"
}
trap cleanup EXIT
sh scripts/staging-tls.sh "$STAGING_TLS_DIR" > "$scratch/tls.log" 2>&1
"${compose[@]}" up -d --wait --wait-timeout 180
"${compose[@]}" exec -T -e ALLOW_SYNTHETIC_DATA=1 app node dist/server/cli.js seed-staging
if "${compose[@]}" exec -T -e ALLOW_SYNTHETIC_DATA=1 app node dist/server/cli.js seed-staging > "$scratch/reseed.log" 2>&1; then
  echo 'A second seed unexpectedly succeeded.' >&2
  exit 1
fi
# No host ports: exercise the app and Mailpit across their own Compose network.
"${compose[@]}" exec -T app node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
const origin = process.env.APP_URL;
const mailHeaders = {Authorization: 'Basic ' + Buffer.from('operator:local-smoke-only').toString('base64')};
assert.equal((await fetch('http://mailpit:8025/api/v1/messages')).status, 401);
assert.equal((await fetch('http://mailpit:8025/')).status, 401);
const api = (route, body, cookie = '') => fetch('http://localhost:3000' + route, {
  method: body ? 'POST' : 'GET', headers: {Origin: origin, 'Content-Type':'application/json', Cookie: cookie},
  ...(body ? {body: JSON.stringify(body)} : {}),
});
const sent = await api('/api/auth/email-otp/send-verification-otp', {email:'alex@example.test',type:'sign-in'});
assert.equal(sent.status, 200, await sent.text());
const messages = await (await fetch('http://mailpit:8025/api/v1/messages', {headers: mailHeaders})).json();
let code;
for (const message of messages.messages) {
  if (!message.To.some((to) => to.Address === 'alex@example.test')) continue;
  const full = await (await fetch('http://mailpit:8025/api/v1/message/' + message.ID, {headers: mailHeaders})).json();
  code = full.Text.match(/sign-in code is (\d{6})/)?.[1];
  if (code) break;
}
assert.ok(code, 'The sign-in email must be captured through verified SMTP TLS.');
const login = await api('/api/auth/sign-in/email-otp', {email:'alex@example.test',otp:code});
assert.equal(login.status, 200, await login.text());
const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const world = await (await api('/api/v1/world', undefined, cookie)).json();
assert.equal(world.environment, 'staging');
assert.equal(world.me.admin, true);
assert.equal(world.groups.length, 2);
assert.ok(world.items.length > 0);
const refused = await api('/api/v1/admin/settings', {key:'SMTP_HOST',value:'smtp.example.com'}, cookie);
assert.equal(refused.status, 409);
const png = await sharp({create:{width:2,height:2,channels:3,background:'#aa4d37'}}).png().toBuffer();
const upload = await fetch('http://localhost:3000/api/v1/media', {method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/octet-stream'},body:png});
assert.equal(upload.status, 200, await upload.clone().text());
const {url} = await upload.json();
assert.equal((await fetch('http://localhost:3000'+url,{headers:{Cookie:cookie}})).status,200);
// Persist only inside this disposable uploads volume to verify container recreation.
await fs.writeFile('/data/uploads/.smoke-check.json', JSON.stringify({cookie,url}));
console.log('Staging login, Mailpit authentication/TLS, metadata, integration lock, and upload checks passed.');
JS
"${compose[@]}" up -d --force-recreate --wait --wait-timeout 180 app worker
"${compose[@]}" exec -T app node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {cookie,url} = JSON.parse(await fs.readFile('/data/uploads/.smoke-check.json','utf8'));
const response = await fetch('http://localhost:3000/api/v1/world',{headers:{Cookie:cookie}});
assert.equal(response.status,200);
assert.equal((await response.json()).environment,'staging');
assert.equal((await fetch('http://localhost:3000'+url,{headers:{Cookie:cookie}})).status,200);
await fs.unlink('/data/uploads/.smoke-check.json');
console.log('Staging account, session, and upload persistence checks passed.');
JS
