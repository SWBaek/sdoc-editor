import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageFile = path.join(root, 'output', `sdoc-editor-cli-${manifest.version}.tgz`);
const npmCli = process.env.npm_execpath;

if (!npmCli) throw new Error('npm_execpath is unavailable; run verify:package:cli through npm.');
if (!existsSync(packageFile)) throw new Error(`Expected CLI package does not exist: ${packageFile}`);

function npm(args, options = {}) {
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  });
}

npm(['exec', '--no', '--offline', '--package=sdoc-editor-cli', '--', 'sdoc', '--version']);
execFileSync(process.execPath, [path.join(root, 'node_modules', 'sdoc-editor-cli', 'dist', 'sdoc.js'), '--version'], {
  cwd: root,
  stdio: 'inherit',
});
npm(['pack', '--dry-run', '--json', './cli']);

const prefix = mkdtempSync(path.join(tmpdir(), 'sdoc-cli-package-'));
try {
  npm(['install', '--global', '--prefix', prefix, packageFile]);
  const globalModules = npm(['root', '--global', '--prefix', prefix]).trim();
  const installedEntry = path.join(globalModules, 'sdoc-editor-cli', 'dist', 'sdoc.js');
  const version = execFileSync(process.execPath, [installedEntry, '--version'], { encoding: 'utf8' }).trim();
  if (version !== manifest.version) {
    throw new Error(`Installed CLI reported ${version}; expected ${manifest.version}.`);
  }

  const title = '한글 제목';
  const documentPath = path.join(prefix, 'utf8-smoke.sdoc');
  execFileSync(process.execPath, [installedEntry, 'create', documentPath, '--title', title, '--json'], {
    stdio: 'inherit',
  });
  const document = JSON.parse(readFileSync(documentPath, 'utf8'));
  if (document.meta?.title !== title) throw new Error('Installed CLI did not preserve the UTF-8 title.');

  if (process.platform !== 'win32') {
    execFileSync(path.join(prefix, 'bin', 'sdoc'), ['--version'], { stdio: 'inherit' });
  }
} finally {
  rmSync(prefix, { recursive: true, force: true });
}

console.log('CLI package install and UTF-8 smoke checks passed.');
