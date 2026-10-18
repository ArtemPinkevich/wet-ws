import { copyFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
if (relative(root, dist) !== 'dist')
  throw new Error('Invalid build output path');
if (process.argv.includes('--clean')) {
  await rm(dist, { recursive: true, force: true });
} else {
  await mkdir(new URL('../dist/frontend/app-shell/', import.meta.url), {
    recursive: true,
  });
  for (const name of ['index.html', 'styles.css']) {
    await copyFile(
      new URL(`../src/frontend/app-shell/${name}`, import.meta.url),
      new URL(`../dist/frontend/app-shell/${name}`, import.meta.url),
    );
  }
}
