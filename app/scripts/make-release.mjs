import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constants, appendFileSync } from 'node:fs';
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
  readdir,
  lstat,
} from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packager } from '@electron/packager';
import { extractFile } from '@electron/asar';
import forge from '../forge.config.cjs';

const root = resolve(import.meta.dirname, '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
let logPath;

// Only an immediate, non-linked run directory under out/build may be removed.
export async function cleanVerifiedRun(buildRoot, run, verified) {
  assert.equal(verified, true, 'An unverified run must be retained');
  const name = relative(resolve(buildRoot), resolve(run));
  assert.ok(
    name &&
      !name.includes('/') &&
      !name.includes('\\') &&
      !isAbsolute(name) &&
      name !== '..',
  );
  assert.equal((await lstat(buildRoot)).isSymbolicLink(), false);
  assert.equal((await lstat(run)).isSymbolicLink(), false);
  await rm(run, { recursive: true });
}

function command(executable, args, env = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (logPath)
    appendFileSync(
      logPath,
      `$ ${executable} ${args.join(' ')}\n${result.stdout ?? ''}${result.stderr ?? ''}\n`,
    );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${executable} ${args.join(' ')} failed`);
}

async function main() {
  assert.equal(
    process.platform,
    'win32',
    'This release command verifies Windows x64 only',
  );
  const buildRoot = resolve(root, 'out/build');
  const run = join(buildRoot, `windows-${randomUUID()}`);
  await mkdir(run, { recursive: true });
  logPath = join(run, 'commands.log');
  const report = {
    status: 'building',
    run,
    startedAt: new Date().toISOString(),
  };
  try {
    command(process.execPath, ['node_modules/typescript/bin/tsc', '--version']);
    command(process.execPath, ['scripts/snapshot.mjs']);
    const manifest = JSON.parse(
      await readFile(join(root, 'out/source-manifest.json'), 'utf8'),
    );
    report.sourceId = manifest.sourceId;
    command(process.env.ComSpec ?? 'cmd.exe', [
      '/d',
      '/s',
      '/c',
      'npm run build',
    ]);
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const paths = await packager({
      ...forge.packagerConfig,
      dir: root,
      out: join(run, 'package'),
      platform: 'win32',
      arch: 'x64',
      electronVersion: pkg.devDependencies.electron,
      ...(process.env.ELECTRON_ZIP_DIR
        ? { electronZipDir: process.env.ELECTRON_ZIP_DIR }
        : {}),
    });
    const zip = join(run, 'release.zip');
    const unpack = join(run, 'unpacked');
    command(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $env:RELEASE_PACKAGE -Force).FullName -DestinationPath $env:RELEASE_ZIP; if (-not $?) { exit 1 }; Expand-Archive -LiteralPath $env:RELEASE_ZIP -DestinationPath $env:RELEASE_UNPACK; if (-not $?) { exit 1 }',
      ],
      { RELEASE_PACKAGE: paths[0], RELEASE_ZIP: zip, RELEASE_UNPACK: unpack },
    );
    // Match compiled product files in the actual ZIP against this build.
    for (const entry of await readdir(join(root, 'dist'), {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue;
      const file = join(entry.parentPath, entry.name);
      const name = relative(join(root, 'dist'), file);
      assert.equal(
        hash(
          extractFile(join(unpack, 'resources/app.asar'), join('dist', name)),
        ),
        hash(await readFile(file)),
        name,
      );
    }
    command(process.execPath, ['scripts/check-iteration-02.mjs', 'desktop'], {
      DESKTOP_EXE: join(unpack, 'wet-ws-ai.exe'),
      CHECKS_DIR: join(run, 'checks'),
    });
    // Detect concurrent source edits before promotion.
    for (const [name, expected] of Object.entries(manifest.files))
      assert.equal(
        hash(await readFile(join(root, name))),
        expected,
        `Source changed during build: ${name}`,
      );
    const bytes = await readFile(zip);
    report.sha256 = hash(bytes);
    report.bytes = bytes.length;
    const name = `wet-ws-${pkg.version}-win-x64-${manifest.sourceId.slice(0, 12)}-${report.sha256.slice(0, 12)}.zip`;
    const releases = join(root, 'out/releases');
    const checks = join(root, 'out/checks/releases');
    await mkdir(releases, { recursive: true });
    await mkdir(checks, { recursive: true });
    const destination = join(releases, name);
    await copyFile(zip, destination, constants.COPYFILE_EXCL);
    assert.equal(hash(await readFile(destination)), report.sha256);
    Object.assign(report, {
      status: 'passed',
      artifact: relative(root, destination),
      checkedAt: new Date().toISOString(),
      verification:
        'ZIP extracted; compiled files matched; packaged Electron echo, two interfaces, reload, shared clear, independent disconnect, narrow viewport',
      limitations: [
        'Second physical LAN machine not tested',
        'Linux delivery not checked by this command',
      ],
    });
    await writeFile(
      join(checks, `${name}.json`),
      JSON.stringify(report, null, 2) + '\n',
    );
    await cleanVerifiedRun(buildRoot, run, true);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    Object.assign(report, { status: 'failed', error: error.stack });
    await writeFile(
      join(run, 'failure.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
