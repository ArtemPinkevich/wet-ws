import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, relative, join } from 'node:path';
import { extractFile } from '@electron/asar';

const root = resolve(import.meta.dirname, '..');
const checks = resolve(root, process.env.CHECKS_DIR ?? 'out/checks');
await mkdir(checks, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(
  await readFile(resolve(root, 'out/source-manifest.json'), 'utf8'),
);
const snapshot = resolve(root, 'out/source-snapshots', manifest.sourceId);
for (const [name, expected] of Object.entries(manifest.files)) {
  assert.equal(
    hash(await readFile(resolve(snapshot, name))),
    expected,
    `Frozen input ${name}`,
  );
}
const desktop = resolve(
  root,
  process.env.DESKTOP_EXE ?? 'out/build/manual/wet-ws-ai.exe',
);
const asar = resolve(desktop, '../resources/app.asar');
const zip = resolve(
  root,
  process.env.ZIP_PATH ?? 'out/build/manual/release.zip',
);
const containerName = process.env.DELIVERY_CONTAINER;
assert.ok(
  containerName,
  'Set DELIVERY_CONTAINER to the running verification container',
);
const container = JSON.parse(
  execFileSync('docker', ['inspect', containerName], { encoding: 'utf8' }),
)[0];
const image = JSON.parse(
  execFileSync('docker', ['image', 'inspect', container.Image], {
    encoding: 'utf8',
  }),
)[0];
assert.equal(
  image.Config.Labels?.['org.opencontainers.image.revision'],
  manifest.sourceId,
);
const containerDist = resolve(checks, 'container-dist');
await mkdir(containerDist, { recursive: true });
execFileSync('docker', ['cp', `${containerName}:/app/dist/.`, containerDist]);
const dist = resolve(snapshot, 'dist');
const sharedFiles = [];
for (const file of (
  await readdir(dist, { recursive: true, withFileTypes: true })
).filter((file) => file.isFile())) {
  const path = resolve(file.parentPath, file.name);
  const name = relative(dist, path);
  const desktopBytes = extractFile(asar, join('dist', name));
  const imageBytes = await readFile(resolve(containerDist, name));
  const expected = hash(await readFile(path));
  assert.equal(hash(desktopBytes), expected, `Desktop compiled file ${name}`);
  assert.equal(hash(imageBytes), expected, `Container compiled file ${name}`);
  sharedFiles.push({ path: name.replaceAll('\\', '/'), sha256: expected });
}
const report = {
  checkedAt: new Date().toISOString(),
  status: 'passed',
  sourceId: manifest.sourceId,
  snapshot,
  sourceFiles: Object.keys(manifest.files).length,
  zip: {
    path: zip,
    bytes: (await stat(zip)).size,
    sha256: hash(await readFile(zip)),
  },
  desktop: {
    executable: desktop,
    sha256: hash(await readFile(desktop)),
    asarSha256: hash(await readFile(asar)),
  },
  container: {
    name: containerName,
    id: container.Id,
    imageId: container.Image,
    imageSize: image.Size,
    user: image.Config.User,
    platform: `${image.Os}/${image.Architecture}`,
    ports: container.NetworkSettings.Ports,
  },
  matchingCompiledFiles: sharedFiles,
};
await writeFile(
  resolve(checks, 'artifacts.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    status: report.status,
    sourceId: report.sourceId,
    matchingFiles: sharedFiles.length,
    imageId: container.Image,
    zipBytes: report.zip.bytes,
  }),
);
