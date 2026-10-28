// Disposable checkout: exercise the public launcher without touching a developer's data.
import assert from "node:assert/strict";
import {
  mkdtemp,
  cp,
  readFile,
  writeFile,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  checkoutIdentity,
  dockerEnvironment,
  envFile,
  runtimeConfiguration,
  gatewayConfiguration,
} from "./config.mjs";

const source = fileURLToPath(new URL("../../", import.meta.url));
const root = await realpath(
  await mkdtemp(join(tmpdir(), "little-hint-preview-smoke-")),
);
const project = checkoutIdentity(root);
const env = dockerEnvironment();
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 20 * 60_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\n${result.stdout?.slice(-4000)}\n${result.stderr?.slice(-4000)}`,
  );
  return result.stdout;
}
const launch = (...args) =>
  run(process.execPath, ["scripts/preview.mjs", ...args]);
const compose = (...args) =>
  run("docker", [
    "compose",
    "--env-file",
    ".local/preview/compose.env",
    "-p",
    project,
    "-f",
    "compose.preview.yaml",
    "--profile",
    "share",
    "--profile",
    "tools",
    ...args,
  ]);
async function check(origin, previous) {
  const api = (path, body, cookie = "") =>
    fetch(origin + path, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookie,
        "Idempotency-Key": randomUUID(),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  if (previous) {
    const world = await api("/api/v1/world", undefined, previous.cookie);
    assert.equal(world.status, 200);
    assert.ok(
      (await world.json()).groups.some((g) => g.name === previous.name),
    );
    assert.equal(
      (
        await fetch(origin + previous.url, {
          headers: { Cookie: previous.cookie },
        })
      ).status,
      200,
    );
    return previous;
  }
  const sent = await api("/api/auth/email-otp/send-verification-otp", {
    email: "alex@example.test",
    type: "sign-in",
  });
  assert.equal(sent.status, 200, await sent.text());
  const inbox = await fetch(origin + "/__preview/inbox/api/v1/messages");
  assert.match(inbox.headers.get("cache-control"), /no-store/);
  const messages = await inbox.json();
  let code;
  for (const message of messages.messages) {
    if (!message.To.some((to) => to.Address === "alex@example.test")) continue;
    const full = await (
      await fetch(origin + "/__preview/inbox/api/v1/message/" + message.ID)
    ).json();
    code = full.Text.match(/sign-in code is (\d{6})/)?.[1];
    if (code) break;
  }
  assert.ok(code, "email must arrive through verified SMTP TLS");
  const login = await api("/api/auth/sign-in/email-otp", {
    email: "alex@example.test",
    otp: code,
  });
  assert.equal(login.status, 200, await login.text());
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const world = await (await api("/api/v1/world", undefined, cookie)).json();
  assert.equal(world.environment, "preview");
  assert.equal(world.me.admin, true);
  assert.equal(world.groups.length, 4);
  assert.ok(world.items.length > 0);
  const name = "Preview smoke " + randomUUID();
  const write = await api("/api/v1/groups", { name }, cookie);
  assert.equal(write.status, 200, await write.text());
  const refused = await api(
    "/api/v1/admin/settings",
    { key: "SMTP_HOST", value: "real.example.com" },
    cookie,
  );
  assert.equal(refused.status, 409);
  // A real valid one-pixel PNG, processed by the application's normal upload path.
  const png = Buffer.from(
    compose(
      "exec",
      "-T",
      "app",
      "node",
      "--input-type=module",
      "-e",
      "import sharp from 'sharp'; console.log((await sharp({create:{width:2,height:2,channels:3,background:'#aa4d37'}}).png().toBuffer()).toString('base64'))",
    ).trim(),
    "base64",
  );
  const upload = await fetch(origin + "/api/v1/media", {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: cookie,
      "Content-Type": "application/octet-stream",
    },
    body: png,
  });
  assert.equal(upload.status, 200, await upload.clone().text());
  const { url } = await upload.json();
  assert.equal(
    (await fetch(origin + url, { headers: { Cookie: cookie } })).status,
    200,
  );
  const sw = await (await fetch(origin + "/sw.js")).text();
  assert.ok(sw.includes("u.pathname.startsWith('/__preview/')"));
  return { cookie, name, url };
}
try {
  await cp(source, root, {
    recursive: true,
    filter: (path) =>
      ![
        ".git",
        ".local",
        "node_modules",
        "dist",
        "test-results",
        "playwright-report",
      ].includes(relative(source, path).split(/[\\/]/)[0]) &&
      !relative(source, path).split(/[\\/]/)[0].startsWith(".env"),
  });
  await writeFile(
    join(root, ".env"),
    "DATABASE_URL=postgres://real:credentials@production/little_hint\nSMTP_HOST=real.example.com\n",
  );
  console.log("Preview smoke: first startup");
  launch("start");
  const session = () =>
    readFile(join(root, ".local/preview/session.json"), "utf8").then(
      JSON.parse,
    );
  let metadata = await session();
  const state = JSON.parse(
    await readFile(join(root, ".local/preview/state.json"), "utf8"),
  );
  const beforeUsers = compose(
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "little_hint_preview",
    "-d",
    "little_hint_preview",
    "-Atc",
    'SELECT id FROM "user" ORDER BY id',
  );
  const saved = await check(metadata.origin);
  assert.match(compose("ps", "--format", "json", "worker"), /healthy/);
  console.log("Preview smoke: stop/restart persistence");
  launch("stop");
  launch("start");
  metadata = await session();
  await check(metadata.origin, saved);
  assert.deepEqual(
    JSON.parse(await readFile(join(root, ".local/preview/state.json"), "utf8")),
    state,
  );
  assert.equal(
    compose(
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "little_hint_preview",
      "-d",
      "little_hint_preview",
      "-Atc",
      'SELECT id FROM "user" ORDER BY id',
    ),
    beforeUsers,
  );
  // Origin changes without Cloudflare: keep gateway's ephemeral port and change
  // the canonical origin to HTTPS. Exercise cookie/CSRF behavior inside the stack.
  const alternate = "https://changed-origin.example.test";
  await writeFile(
    join(root, ".local/preview/runtime.env"),
    envFile(runtimeConfiguration(state, alternate)),
  );
  await writeFile(
    join(root, ".local/preview/gateway/Caddyfile"),
    gatewayConfiguration(alternate),
  );
  compose(
    "exec",
    "-T",
    "gateway",
    "caddy",
    "reload",
    "--config",
    "/etc/caddy/Caddyfile",
  );
  compose(
    "up",
    "-d",
    "--force-recreate",
    "--wait",
    "--wait-timeout",
    "180",
    "app",
    "worker",
  );
  const originCheck = `
    import assert from 'node:assert/strict';
    const origin=process.env.APP_URL;
    const request=o=>fetch('http://localhost:3000/api/auth/email-otp/send-verification-otp',{method:'POST',headers:{Origin:o,'Content-Type':'application/json'},body:JSON.stringify({email:'sam@example.test',type:'sign-in'})});
    assert.equal((await request(${JSON.stringify(metadata.origin)})).status,403);
    assert.equal((await request(origin)).status,200);
    const messages=await (await fetch('http://mailpit:8025/__preview/inbox/api/v1/messages')).json();
    let otp;
    for(const m of messages.messages){if(!m.To.some(t=>t.Address==='sam@example.test'))continue;const full=await(await fetch('http://mailpit:8025/__preview/inbox/api/v1/message/'+m.ID)).json();otp=full.Text.match(/sign-in code is (\\d{6})/)?.[1];if(otp)break;}
    assert.ok(otp);
    const login=await fetch('http://localhost:3000/api/auth/sign-in/email-otp',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'sam@example.test',otp})});
    assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/Secure/);
    assert.match(login.headers.get('set-cookie'),/__Secure-/);
    const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
    assert.equal((await fetch('http://localhost:3000/api/v1/world',{headers:{Cookie:cookie}})).status,200);
  `;
  compose(
    "exec",
    "-T",
    "app",
    "node",
    "--input-type=module",
    "-e",
    originCheck,
  );
  const redirect = await fetch(`http://localhost:${metadata.port}/`, {
    redirect: "manual",
  });
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get("location"), alternate + "/");
  console.log("Preview smoke: confirmed reset and reseed");
  launch("reset", "--yes");
  metadata = await session();
  assert.notEqual(
    compose(
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "little_hint_preview",
      "-d",
      "little_hint_preview",
      "-Atc",
      'SELECT id FROM "user" ORDER BY id',
    ),
    beforeUsers,
  );
  const count = compose(
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "little_hint_preview",
    "-d",
    "little_hint_preview",
    "-Atc",
    `SELECT count(*) FROM app_record WHERE kind='groups'`,
  );
  assert.equal(count.trim(), "4");
  const mail = await (
    await fetch(metadata.origin + "/__preview/inbox/api/v1/messages")
  ).json();
  assert.ok(
    !mail.messages.some(
      (m) =>
        m.To.some((t) => t.Address === "alex@example.test") &&
        m.Subject.includes("code"),
    ),
  );
  console.log(
    "Preview smoke passed: sign-in, Mailpit TLS/path, write, upload, worker, origin change, persistence, reset.",
  );
} finally {
  try {
    compose("down", "--volumes", "--remove-orphans");
  } finally {
    // TLS files are root-owned on native Linux. Use the pinned tool container to
    // remove only this disposable checkout's generated certificate directory.
    run("docker", [
      "run",
      "--rm",
      "--network",
      "none",
      "--entrypoint",
      "sh",
      "-v",
      `${resolve(root, ".local/preview/tls")}:/tls`,
      "alpine/openssl:3.5.4",
      "-c",
      "rm -f /tls/*",
    ]);
    spawnSync("docker", ["image", "rm", `${project}:app`], {
      env,
      stdio: "ignore",
      timeout: 30_000,
    });
    await rm(root, { recursive: true, force: true });
  }
}
