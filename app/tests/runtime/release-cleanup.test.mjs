import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanVerifiedRun } from '../../scripts/make-release.mjs';

test('release cleanup retains failures and prior artifacts; removes only verified run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wet-release-'));
  try {
    const build = join(root, 'build');
    const run = join(build, 'run');
    const prior = join(root, 'prior.zip');
    await mkdir(run, { recursive: true });
    await writeFile(join(run, 'diagnostic.txt'), 'failure evidence');
    await writeFile(prior, 'previous release');
    await assert.rejects(cleanVerifiedRun(build, run, false));
    assert.equal(
      await readFile(join(run, 'diagnostic.txt'), 'utf8'),
      'failure evidence',
    );
    await assert.rejects(cleanVerifiedRun(build, root, true));
    await assert.rejects(cleanVerifiedRun(build, build, true));
    await cleanVerifiedRun(build, run, true);
    await assert.rejects(access(run));
    assert.equal(await readFile(prior, 'utf8'), 'previous release');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
