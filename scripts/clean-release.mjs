/**
 * Remove electron-builder intermediates so `release/` contains only the
 * distributable installers (DMG, EXE, and any other packaged artifacts).
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const releaseDir = path.resolve(import.meta.dirname, '..', 'release');
const intermediateDirs = new Set([
  'mac-arm64',
  'mac',
  'mac-universal',
  'win-unpacked',
  'win-ia32-unpacked',
  'win-arm64-unpacked',
  'linux-unpacked',
  'linux-arm64-unpacked',
  'nsis-web'
]);
const intermediateFiles = new Set([
  '.DS_Store',
  'builder-debug.yml',
  'latest.yml',
  'latest-mac.yml',
  'latest-linux.yml'
]);

let removed = 0;
let entries;
try {
  entries = await fs.readdir(releaseDir, { withFileTypes: true });
} catch {
  process.exit(0);
}
for (const entry of entries) {
  const target = path.join(releaseDir, entry.name);
  const directory = entry.isDirectory() && intermediateDirs.has(entry.name);
  const file = entry.isFile() && (intermediateFiles.has(entry.name) || entry.name.endsWith('.blockmap'));
  if (!directory && !file) continue;
  await fs.rm(target, { recursive: directory, force: true });
  removed += 1;
}
console.log(removed
  ? `Cleaned ${removed} build intermediate${removed === 1 ? '' : 's'} from release/.`
  : 'release/ is already clean.');
