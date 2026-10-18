import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream, appendFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createServer } from 'node:net';
import { cleanVerifiedRun } from './make-release.mjs';

const root = resolve(import.meta.dirname, '..');
const build = join(root, 'out/build');
const token = randomUUID();
const run = join(build, `docker-${token}`);
await mkdir(run, { recursive: true });
const report = { status: 'building', startedAt: new Date().toISOString() };
let container;
let image;
let removedTag = false;
function command(exe, args, options = {}) {
  const result = spawnSync(exe, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  appendFileSync(
    join(run, 'commands.log'),
    `$ ${exe} ${args.join(' ')}\n${result.stdout ?? ''}${result.stderr ?? ''}\n`,
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${exe} failed: ${args.join(' ')}`);
  return result.stdout.trim();
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
try {
  assert.equal(command('docker', ['info', '--format', '{{.OSType}}']), 'linux');
  command(process.execPath, ['scripts/snapshot.mjs']);
  const manifest = JSON.parse(
    await readFile(join(root, 'out/source-manifest.json'), 'utf8'),
  );
  report.sourceId = manifest.sourceId;
  const snapshot = join(root, 'out/source-snapshots', manifest.sourceId);
  const pkg = JSON.parse(
    await readFile(join(snapshot, 'package.json'), 'utf8'),
  );
  image = `wet-ws:${pkg.version}-${manifest.sourceId.slice(0, 12)}-${token.slice(0, 8)}`;
  command('docker', [
    'build',
    '--platform',
    'linux/amd64',
    '--label',
    `org.opencontainers.image.revision=${manifest.sourceId}`,
    '-t',
    image,
    snapshot,
  ]);
  const imageId = command('docker', [
    'image',
    'inspect',
    '--format',
    '{{.Id}}',
    image,
  ]);
  assert.equal(
    command('docker', [
      'image',
      'inspect',
      '--format',
      '{{.Os}}/{{.Architecture}}',
      image,
    ]),
    'linux/amd64',
  );
  const bundle = join(run, 'bundle');
  await mkdir(bundle);
  const tar = join(bundle, 'image.tar');
  command('docker', ['save', '--output', tar, image]);
  // Remove only our unique tag, so load must recreate it from the saved archive.
  command('docker', ['image', 'rm', image]);
  removedTag = true;
  command('docker', ['load', '--input', tar]);
  removedTag = false;
  assert.equal(
    command('docker', ['image', 'inspect', '--format', '{{.Id}}', image]),
    imageId,
  );
  await writeFile(
    join(bundle, 'compose.yaml'),
    `services:\n  wet-ws:\n    image: ${image}\n    platform: linux/amd64\n    pull_policy: never\n    ports:\n      - "8080:8080"\n      - "8081:8081"\n`,
  );
  await writeFile(
    join(bundle, 'README.txt'),
    `WET-WS ${pkg.version} — offline Linux/amd64 image\n\nRequires Docker Engine (Linux) or Docker Desktop in Linux-container mode (Windows/macOS), and Docker Compose v2. Docker itself is not included. Intel/AMD x64; ARM requires emulation and is not verified.\n\nFrom this folder:\n  docker load --input image.tar\n  docker compose up -d --pull never\n\nOpen http://localhost:8080 (or the Docker host LAN address). Client listener defaults to port 8081. Both ports must be free and allowed by firewall. No source code, Node.js installation or registry access is needed for this start.\nStop:\n  docker compose down\n\nSession/history are in memory and are lost when the service stops. Changing networks or restarting Docker can interrupt connections.\n\nSource: ${manifest.sourceId}\nImage: ${imageId}\nSHA256SUMS covers the image and compose file.\n`,
  );
  command('docker', [
    'compose',
    '-f',
    join(bundle, 'compose.yaml'),
    'config',
    '--quiet',
  ]);
  const uiPort = await freePort();
  const clientPort = await freePort();
  const testCompose = join(run, 'verify.yaml');
  // Same saved image and pull policy, isolated test ports; allow host echo server.
  await writeFile(
    testCompose,
    `services:\n  wet-ws:\n    image: ${image}\n    platform: linux/amd64\n    pull_policy: never\n    environment:\n      PORT: "${uiPort}"\n${process.platform === 'linux' ? '    extra_hosts:\n      - "host.docker.internal:host-gateway"\n' : ''}    ports:\n      - "127.0.0.1:${uiPort}:${uiPort}"\n      - "127.0.0.1:${clientPort}:${clientPort}"\n`,
  );
  container = `wet-offline-${token}`;
  command('docker', [
    'compose',
    '-p',
    container,
    '-f',
    testCompose,
    'up',
    '-d',
    '--pull',
    'never',
  ]);
  const readyDeadline = Date.now() + 15000;
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${uiPort}`, {
        signal: AbortSignal.timeout(1000),
      });
      await response.body?.cancel();
      if (response.ok) break;
    } catch {
      /* The container may still be starting. */
    }
    assert.ok(Date.now() < readyDeadline, 'Container HTTP readiness timed out');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  // Build only the local test harness; the container uses the frozen Docker build.
  command(process.execPath, ['scripts/copy-assets.mjs', '--clean']);
  command(process.execPath, ['node_modules/typescript/bin/tsc']);
  command(process.execPath, ['scripts/copy-assets.mjs']);
  command(process.execPath, ['scripts/check-iteration-02.mjs'], {
    env: {
      ...process.env,
      DELIVERY_URL: `http://127.0.0.1:${uiPort}`,
      DELIVERY_CLIENT_PORT: String(clientPort),
      CHECKS_DIR: join(run, 'checks'),
    },
  });
  command('docker', ['compose', '-p', container, '-f', testCompose, 'down']);
  container = undefined;
  for (const [name, expected] of Object.entries(manifest.files))
    assert.equal(
      createHash('sha256')
        .update(await readFile(join(root, name)))
        .digest('hex'),
      expected,
      `Source changed: ${name}`,
    );
  const hashes = {};
  for (const name of ['image.tar', 'compose.yaml', 'README.txt']) {
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(join(bundle, name)))
      hash.update(bytes);
    hashes[name] = hash.digest('hex');
  }
  await writeFile(
    join(bundle, 'SHA256SUMS'),
    Object.entries(hashes)
      .map(([name, hash]) => `${hash}  ${name}`)
      .join('\n') + '\n',
  );
  const name = `wet-ws-${pkg.version}-linux-amd64-${manifest.sourceId.slice(0, 12)}-${token.slice(0, 8)}`;
  const releases = join(root, 'out/releases');
  const checks = join(root, 'out/checks/releases');
  await mkdir(releases, { recursive: true });
  await mkdir(checks, { recursive: true });
  await rename(bundle, join(releases, name));
  Object.assign(report, {
    status: 'passed',
    artifact: relative(root, join(releases, name)),
    image,
    imageId,
    hashes,
    checkedAt: new Date().toISOString(),
    verification:
      'save, remove unique tag, load, image identity, Compose pull never, real echo and UI checks',
    limitations: [
      'Not tested on a second physical LAN machine',
      'Physical network isolation not tested',
      'macOS, native Linux host and ARM not tested',
    ],
  });
  await writeFile(
    join(checks, `${name}.json`),
    JSON.stringify(report, null, 2) + '\n',
  );
  await cleanVerifiedRun(build, run, true);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (container) {
    try {
      command('docker', [
        'compose',
        '-p',
        container,
        '-f',
        join(run, 'verify.yaml'),
        'down',
      ]);
    } catch {
      /* Retain diagnostics. */
    }
  }
  Object.assign(report, {
    status: 'failed',
    error: error.stack,
    image,
    removedTag,
  });
  await writeFile(
    join(run, 'failure.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  throw error;
}
