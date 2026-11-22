/**
 * End-to-end smoke test against the built Electron app.
 *
 * It creates a temporary Git repository and a throwaway Electron profile,
 * launches GitGlance, then verifies the project list, file preview, history,
 * and AI chat shell. Nothing in your real config or repositories is touched.
 */
import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const distEntry = path.join(projectRoot, 'dist', 'index.html');
const electronEntry = path.join(projectRoot, 'dist-electron', 'main.cjs');
const preloadEntry = path.join(projectRoot, 'dist-electron', 'preload.cjs');
const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitglance-smoke-repo-'));
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitglance-smoke-profile-'));
const gitConfigPath = path.join(userDataDir, 'gitconfig');

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.cwd || repoDir,
    env: { ...process.env, GIT_CONFIG_GLOBAL: gitConfigPath },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

let app = null;
let passed = false;

try {
  await fs.access(distEntry).catch(() => {
    throw new Error('dist/index.html is missing. Run `npm run build` first (or use `npm run smoke`).');
  });
  await Promise.all([electronEntry, preloadEntry].map((entry) => fs.access(entry).catch(() => {
    throw new Error('Compiled Electron files are missing. Run `npm run build` first (or use `npm run smoke`).');
  })));

  git(['config', '--file', gitConfigPath, 'user.name', 'Smoke Test']);
  git(['config', '--file', gitConfigPath, 'user.email', 'smoke@example.com']);
  git(['init', '-b', 'main']);
  await fs.writeFile(path.join(repoDir, 'README.md'), '# Smoke repository\n\nThis repository was created by GitGlance’s smoke test.\n');
  await fs.mkdir(path.join(repoDir, 'src'));
  await fs.writeFile(path.join(repoDir, 'src', 'app.js'), 'export const ready = true;\n');
  git(['add', 'README.md']);
  git(['-c', 'user.name=Smoke Test', '-c', 'user.email=smoke@example.com', 'commit', '-m', 'Initial commit']);

  app = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: gitConfigPath,
      GITGLANCE_USER_DATA: userDataDir,
      GITGLANCE_REPO: repoDir,
      GITGLANCE_DISABLE_SINGLE_INSTANCE: '1'
    },
    timeout: 30_000
  });

  const window = await app.firstWindow();
  const pageErrors = [];
  window.on('pageerror', (error) => pageErrors.push(error.message));
  window.on('console', (message) => {
    if (message.type() === 'error') console.log(`[renderer] ${message.text()}`);
  });

  await window.waitForLoadState('domcontentloaded');
  await window.waitForSelector('#bootSplash.is-hidden', { timeout: 20_000 });
  await window.waitForSelector('.project .proj-name', { timeout: 15_000 });

  const projectName = await window.locator('.project .proj-name').first().innerText();
  const projectCount = await window.locator('.project').count();
  if (projectName !== path.basename(repoDir) || projectCount !== 1) {
    throw new Error(`Unexpected project list: ${projectCount} entries, first is “${projectName}”`);
  }

  const heading = await window.locator('.title-row h1').innerText();
  if (!heading.includes(path.basename(repoDir))) {
    throw new Error(`Summary did not switch to the test repository (heading: ${heading})`);
  }

  const cleanHistory = await window.locator('#historyList .commit-row').count();
  if (cleanHistory < 1) throw new Error('History list did not render the initial commit.');

  await window.waitForSelector('#chatPanel.is-active .chat-welcome', { timeout: 10_000 });

  await window.locator('#tabFiles').click();
  await window.waitForSelector('#filesPanel.is-active', { timeout: 10_000 });
  await window.locator('[data-file="README.md"]').click();
  await window.waitForSelector('#diffPane .text-code', { timeout: 15_000 });
  const previewText = await window.locator('#diffPane .text-code').innerText();
  if (!previewText.includes('Smoke repository')) throw new Error('README preview did not load.');

  await window.locator('#tabChat').click();
  await window.waitForSelector('#chatPanel.is-active .chat-welcome', { timeout: 10_000 });
  await window.locator('#tabHistory').click();
  await window.waitForSelector('#historyPanel.is-active .commit-row', { timeout: 10_000 });

  if (pageErrors.length) throw new Error(`Renderer error: ${pageErrors.join(' | ')}`);

  passed = true;
  console.log('GitGlance smoke test passed.');
  console.log(`  repository: ${path.basename(repoDir)}`);
  console.log(`  project list: ${projectCount} entry`);
  console.log(`  preview: ${previewText.split('\n')[0]}`);
  console.log(`  history: ${cleanHistory} commit`);
  console.log('  default tab: Chat');
  console.log('  tabs: Chat, Files, History');
} finally {
  if (app) await app.close().catch(() => {});
  await fs.rm(repoDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}

if (!passed) process.exit(1);
