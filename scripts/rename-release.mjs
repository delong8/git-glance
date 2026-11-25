/**
 * Rename freshly built installers to the release naming convention:
 *   GitGlance-[YYMMDD.COMMIT_SHORT_SHA]-[arm/x64].[dmg/exe]
 *
 * Usage: node scripts/rename-release.mjs [mac|win|all]
 * Only artifacts for the requested target are renamed; the other platform's
 * existing installer is left untouched.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const releaseDir = path.join(root, 'release');
const target = (process.argv[2] || 'all').toLowerCase();
if (!['mac', 'win', 'all'].includes(target)) {
  console.error(`Unknown release target "${target}". Use mac, win, or all.`);
  process.exit(1);
}

function dateStamp() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function commitStamp() {
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim() || 'nogit';
  } catch {
    return 'nogit';
  }
}

/**
 * Prefer the tag baked into dist-electron/build-tag.json at build time so the
 * installer name matches the tag the app shows in its sidebar and About dialog.
 * Fall back to the build date and HEAD when the app was not built first.
 */
async function releaseStamp() {
  try {
    const info = JSON.parse(await fs.readFile(path.join(root, 'dist-electron', 'build-tag.json'), 'utf8'));
    if (typeof info.tag === 'string' && /^\d{6}\.[a-z0-9]+$/i.test(info.tag)) return info.tag;
  } catch {
    /* no baked tag; use the build machine clock and HEAD */
  }
  return `${dateStamp()}.${commitStamp()}`;
}

const stamp = await releaseStamp();

async function releaseEntries() {
  try {
    return await fs.readdir(releaseDir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function renameNewest({ extension, archPattern, finalArch }) {
  const candidates = [];
  for (const entry of await releaseEntries()) {
    if (!entry.isFile() || !entry.name.endsWith(extension)) continue;
    if (!new RegExp(`(^|[-.])${archPattern}([-.]|$)`).test(entry.name)) continue;
    if (/uninstaller/i.test(entry.name)) continue;
    const stat = await fs.stat(path.join(releaseDir, entry.name));
    candidates.push({ name: entry.name, mtime: stat.mtimeMs });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  const source = path.join(releaseDir, candidates[0].name);
  const finalName = `GitGlance-${stamp}-${finalArch}${extension}`;
  const finalPath = path.join(releaseDir, finalName);
  if (path.basename(source) !== finalName) {
    await fs.rm(finalPath, { force: true });
    await fs.rename(source, finalPath);
  }
  return finalName;
}

async function removeOldInstallers(extensions, keep) {
  let removed = 0;
  for (const entry of await releaseEntries()) {
    if (!entry.isFile()) continue;
    if (!extensions.some((extension) => entry.name.endsWith(extension))) continue;
    if (keep.has(entry.name)) continue;
    await fs.rm(path.join(releaseDir, entry.name), { force: true });
    removed += 1;
  }
  return removed;
}

const built = [];
if (target === 'mac' || target === 'all') {
  const name = await renameNewest({ extension: '.dmg', archPattern: 'arm64|arm', finalArch: 'arm' });
  if (!name) {
    console.error('No macOS DMG was found to rename.');
    process.exit(1);
  }
  built.push(name);
}
if (target === 'win' || target === 'all') {
  const name = await renameNewest({ extension: '.exe', archPattern: 'x64', finalArch: 'x64' });
  if (!name) {
    console.error('No Windows installer was found to rename.');
    process.exit(1);
  }
  built.push(name);
}

if (target === 'mac' || target === 'all') await removeOldInstallers(['.dmg'], new Set(built));
if (target === 'win' || target === 'all') await removeOldInstallers(['.exe'], new Set(built));

console.log(`Release artifacts (${stamp}): ${built.join(', ')}`);
