/**
 * Write the release tag stamped into installer filenames:
 *   YYMMDD.<7-character HEAD SHA>
 *
 * The Electron main process reads dist-electron/build-tag.json so the sidebar
 * badge and About dialog show the same tag as the release file.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const now = new Date();
const date = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
let sha = 'nogit';
try {
  sha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim() || 'nogit';
} catch {
  /* keep the fallback so a source tarball still builds */
}
const tag = `${date}.${sha}`;
await fs.mkdir(path.join(root, 'dist-electron'), { recursive: true });
await fs.writeFile(
  path.join(root, 'dist-electron', 'build-tag.json'),
  `${JSON.stringify({ tag, date, sha }, null, 2)}\n`
);
console.log(`Build tag: ${tag}`);
