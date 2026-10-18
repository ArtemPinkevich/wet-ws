import { createHash } from 'node:crypto';
import {
  readFile,
  readdir,
  mkdir,
  copyFile,
  writeFile,
} from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'forge.config.cjs',
  'eslint.config.mjs',
  '.prettierrc.json',
  '.prettierignore',
  'Dockerfile',
  '.dockerignore',
  '.node-version',
  '.gitignore',
  'README.md',
  'AGENTS.md',
];
async function collect(dir) {
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const name = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await collect(name);
    else files.push(name);
  }
}
for (const dir of ['src', 'scripts', 'tests', 'echo-demo']) await collect(dir);
const hashes = {};
for (const name of files.sort())
  hashes[name] = createHash('sha256')
    .update(await readFile(join(root, name)))
    .digest('hex');
const sourceId = createHash('sha256')
  .update(JSON.stringify(hashes))
  .digest('hex');
const destination = join(root, 'out', 'source-snapshots', sourceId);
await mkdir(destination, { recursive: true });
for (const name of files) {
  const target = join(destination, name);
  await mkdir(resolve(target, '..'), { recursive: true });
  await copyFile(join(root, name), target);
}
const manifest = { sourceId, algorithm: 'SHA-256', files: hashes };
await writeFile(
  join(destination, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
await writeFile(
  join(root, 'out', 'source-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    sourceId,
    path: relative(root, destination),
    files: files.length,
  }),
);
