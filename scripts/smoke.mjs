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
const worktreeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitglance-smoke-worktree-'));
const submoduleSourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitglance-smoke-sub-src-'));
const submoduleRemoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitglance-smoke-sub-remote-'));
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitglance-smoke-profile-'));
const gitConfigPath = path.join(userDataDir, 'gitconfig');

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.cwd || repoDir,
    env: { ...process.env, GIT_CONFIG_GLOBAL: gitConfigPath, GIT_CONFIG_NOSYSTEM: '1' },
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
  git(['config', 'filter.lfs.clean', 'cat']);
  git(['config', 'filter.lfs.smudge', 'cat']);
  git(['config', 'filter.lfs.required', 'false']);
  await fs.writeFile(path.join(repoDir, 'README.md'), '# Smoke repository\n\nThis repository was created by GitGlance’s smoke test.\n');
  await fs.mkdir(path.join(repoDir, 'src'));
  await fs.writeFile(path.join(repoDir, 'src', 'app.js'), 'export const ready = true;\n');
  await fs.writeFile(path.join(repoDir, 'asset.bin'), `version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(64)}\nsize 123456\n`);
  await fs.writeFile(path.join(repoDir, 'large.dat'), Buffer.alloc(5.5 * 1024 * 1024, 0x61));
  git(['add', '.']);
  git(['-c', 'user.name=Smoke Test', '-c', 'user.email=smoke@example.com', 'commit', '-m', 'Initial commit']);
  await fs.writeFile(path.join(repoDir, '.gitattributes'), '*.bin filter=lfs diff=lfs merge=lfs -text\n');
  git(['add', '.gitattributes']);
  git(['-c', 'user.name=Smoke Test', '-c', 'user.email=smoke@example.com', 'commit', '-m', 'Configure LFS']);

  const submoduleRemote = path.join(submoduleRemoteDir, 'sub.git');
  git(['init', '--bare', '-b', 'main', submoduleRemote]);
  git(['init', '-b', 'main'], { cwd: submoduleSourceDir });
  git(['config', 'user.name', 'Smoke Test'], { cwd: submoduleSourceDir });
  git(['config', 'user.email', 'smoke@example.com'], { cwd: submoduleSourceDir });
  await fs.writeFile(path.join(submoduleSourceDir, 'README.md'), '# Smoke submodule\n');
  git(['add', '.'], { cwd: submoduleSourceDir });
  git(['commit', '-m', 'Initial submodule commit'], { cwd: submoduleSourceDir });
  git(['remote', 'add', 'origin', submoduleRemote], { cwd: submoduleSourceDir });
  git(['push', 'origin', 'main'], { cwd: submoduleSourceDir });
  git(['config', 'protocol.file.allow', 'always']);
  git(['-c', 'protocol.file.allow=always', 'submodule', 'add', submoduleRemote, 'vendor/sub']);
  git(['commit', '-m', 'Add submodule']);

  git(['tag', 'v1.0.0']);
  git(['tag', '-a', 'v1.1.0', '-m', 'Smoke release']);
  await fs.appendFile(path.join(repoDir, 'README.md'), '\nStash me.\n');
  git(['stash', 'push', '-m', 'Smoke stash']);
  git(['worktree', 'add', '-b', 'smoke-worktree', worktreeDir]);
  git(['remote', 'add', 'origin', 'https://example.com/acme/console.git']);
  git(['update-ref', 'refs/remotes/origin/main', git(['rev-parse', 'HEAD'])]);
  git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);

  app = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: gitConfigPath,
      GIT_CONFIG_NOSYSTEM: '1',
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

  const titlebarPath = await window.locator('#windowContext .wc-path-text').innerText();
  if (!titlebarPath.includes(path.basename(repoDir))) {
    throw new Error(`Title bar did not show the repository path (got “${titlebarPath}”)`);
  }
  if (await window.locator('#summaryRoot .path-line').count()) {
    throw new Error('The repository path is still rendered in the summary header.');
  }

  const sidebarToggle = window.locator('#sidebarToggle');
  await sidebarToggle.click();
  await window.waitForFunction(() => document.querySelector('.app')?.classList.contains('is-sidebar-hidden'), null, { timeout: 5_000 });
  await window.waitForFunction(() => {
    const sidebar = document.querySelector('#projectSidebar');
    if (!sidebar) return false;
    const box = sidebar.getBoundingClientRect();
    return box.right <= 1 && box.x < 0;
  }, null, { timeout: 5_000 });
  if ((await sidebarToggle.getAttribute('aria-pressed')) !== 'true') {
    throw new Error('Sidebar toggle did not report its hidden state.');
  }
  if (!(await sidebarToggle.getAttribute('title'))?.includes('Show projects')) {
    throw new Error('Sidebar toggle title did not switch to “Show projects”.');
  }
  await sidebarToggle.click();
  await window.waitForFunction(() => !document.querySelector('.app')?.classList.contains('is-sidebar-hidden'), null, { timeout: 5_000 });
  await window.waitForFunction(() => {
    const sidebar = document.querySelector('#projectSidebar');
    return !!sidebar && Math.round(sidebar.getBoundingClientRect().x) === 0;
  }, null, { timeout: 5_000 });
  if ((await sidebarToggle.getAttribute('aria-pressed')) !== 'false') {
    throw new Error('Sidebar toggle did not report its visible state.');
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

  await window.locator('#tabWorktrees').click();
  await window.waitForSelector('#worktreesPanel.is-active .worktree-row', { timeout: 10_000 });
  const worktreeCount = await window.locator('#worktreesList .worktree-row').count();
  if (worktreeCount !== 2) throw new Error(`Expected 2 worktrees, found ${worktreeCount}.`);
  const worktreeText = (await window.locator('#worktreesList').innerText()).toLowerCase();
  if (!worktreeText.includes('smoke-worktree')) throw new Error('Linked worktree was not listed.');
  if (!worktreeText.includes('main worktree')) throw new Error('Main worktree badge is missing.');
  if (!worktreeText.includes('current')) throw new Error('Current worktree badge is missing.');

  await window.locator('#tabSearch').fill('smoke-worktree');
  const filteredWorktrees = await window.locator('#worktreesList .worktree-row').count();
  if (filteredWorktrees !== 1) throw new Error(`Worktree filter did not narrow the list (found ${filteredWorktrees}).`);
  await window.locator('#tabSearchClear').click();
  await window.waitForFunction(() => document.querySelectorAll('#worktreesList .worktree-row').length === 2, null, { timeout: 5_000 });

  await window.locator('#tabRemotes').click();
  await window.waitForSelector('#remotesPanel.is-active .remote-row', { timeout: 10_000 });
  const remoteCount = await window.locator('#remotesList .remote-row').count();
  if (remoteCount !== 1) throw new Error(`Expected 1 remote, found ${remoteCount}.`);
  const remoteText = (await window.locator('#remotesList').innerText()).toLowerCase();
  if (!remoteText.includes('origin')) throw new Error('Remote name was not listed.');
  if (!remoteText.includes('example.com')) throw new Error('Remote fetch URL was not listed.');
  if (!remoteText.includes('main')) throw new Error('Remote default branch was not listed.');
  if (!remoteText.includes('1 branch')) throw new Error('Remote branch count was not listed.');

  await window.locator('#tabSearch').fill('example.com');
  const filteredRemotes = await window.locator('#remotesList .remote-row').count();
  if (filteredRemotes !== 1) throw new Error(`Remote filter did not match the URL (found ${filteredRemotes}).`);
  await window.locator('#tabSearchClear').click();
  await window.waitForFunction(() => document.querySelectorAll('#remotesList .remote-row').length === 1, null, { timeout: 5_000 });

  await window.locator('#tabBranches').click();
  await window.waitForSelector('#branchesPanel.is-active .branch-row', { timeout: 10_000 });
  const branchCount = await window.locator('#branchesList .branch-row').count();
  if (branchCount !== 3) throw new Error(`Expected 3 branches, found ${branchCount}.`);
  const branchText = (await window.locator('#branchesList').innerText()).toLowerCase();
  if (!branchText.includes('smoke-worktree')) throw new Error('Local branch was not listed.');
  if (!branchText.includes('origin/main')) throw new Error('Remote-tracking branch was not listed.');
  if (!branchText.includes('current')) throw new Error('Current branch badge is missing.');
  if (!branchText.includes('remote')) throw new Error('Remote branch badge is missing.');

  await window.locator('#tabSearch').fill('smoke-worktree');
  const filteredBranches = await window.locator('#branchesList .branch-row').count();
  if (filteredBranches !== 1) throw new Error(`Branch filter did not narrow the list (found ${filteredBranches}).`);
  await window.locator('#tabSearchClear').click();
  await window.waitForFunction(() => document.querySelectorAll('#branchesList .branch-row').length === 3, null, { timeout: 5_000 });

  await window.locator('#tabTags').click();
  await window.waitForSelector('#tagsPanel.is-active .tag-row', { timeout: 10_000 });
  const tagCount = await window.locator('#tagsList .tag-row').count();
  if (tagCount !== 2) throw new Error(`Expected 2 tags, found ${tagCount}.`);
  const tagText = (await window.locator('#tagsList').innerText()).toLowerCase();
  if (!tagText.includes('v1.0.0')) throw new Error('Lightweight tag was not listed.');
  if (!tagText.includes('v1.1.0')) throw new Error('Annotated tag was not listed.');
  if (!tagText.includes('annotated')) throw new Error('Annotated tag badge is missing.');
  if (!tagText.includes('lightweight')) throw new Error('Lightweight tag badge is missing.');
  if (!tagText.includes('smoke release')) throw new Error('Tag annotation was not listed.');
  if (!tagText.includes('head')) throw new Error('HEAD tag badge is missing.');

  await window.locator('#tabSearch').fill('v1.1');
  const filteredTags = await window.locator('#tagsList .tag-row').count();
  if (filteredTags !== 1) throw new Error(`Tag filter did not narrow the list (found ${filteredTags}).`);
  await window.locator('#tabSearchClear').click();
  await window.waitForFunction(() => document.querySelectorAll('#tagsList .tag-row').length === 2, null, { timeout: 5_000 });

  await window.locator('#tabStashes').click();
  await window.waitForSelector('#stashesPanel.is-active .stash-row', { timeout: 10_000 });
  const stashCount = await window.locator('#stashesList .stash-row').count();
  if (stashCount !== 1) throw new Error(`Expected 1 stash, found ${stashCount}.`);
  const stashText = (await window.locator('#stashesList').innerText()).toLowerCase();
  if (!stashText.includes('stash@{0}')) throw new Error('Stash reference was not listed.');
  if (!stashText.includes('smoke stash')) throw new Error('Stash message was not listed.');
  if (!stashText.includes('1 file')) throw new Error('Stash file stats were not listed.');
  if (!stashText.includes('base')) throw new Error('Stash base commit was not listed.');

  await window.locator('#tabSearch').fill('smoke stash');
  const filteredStashes = await window.locator('#stashesList .stash-row').count();
  if (filteredStashes !== 1) throw new Error(`Stash filter did not narrow the list (found ${filteredStashes}).`);
  await window.locator('#tabSearchClear').click();
  await window.waitForFunction(() => document.querySelectorAll('#stashesList .stash-row').length === 1, null, { timeout: 5_000 });

  await window.locator('#tabLfs').click();
  await window.waitForSelector('#lfsPanel.is-active .lfs-row', { timeout: 15_000 });
  const lfsFileCount = await window.locator('#lfsList .lfs-row').count();
  const largeFileCount = await window.locator('#largeList .lfs-row').count();
  if (lfsFileCount !== 1) throw new Error(`Expected 1 LFS file, found ${lfsFileCount}.`);
  if (largeFileCount !== 1) throw new Error(`Expected 1 large file, found ${largeFileCount}.`);
  const lfsText = (await window.locator('#lfsPanel').innerText()).toLowerCase();
  if (!lfsText.includes('asset.bin')) throw new Error('LFS file was not listed.');
  if (!lfsText.includes('large.dat')) throw new Error('Large file was not listed.');
  if (!lfsText.includes('pointer')) throw new Error('LFS pointer badge is missing.');
  if (!lfsText.includes('tracked')) throw new Error('Tracked badge is missing.');
  if (!lfsText.includes('1 lfs file')) throw new Error('LFS summary is missing.');
  if (!lfsText.includes('1 large file')) throw new Error('Large-file summary is missing.');

  await window.locator('#tabSearch').fill('large.dat');
  const filteredLfs = await window.locator('#lfsList .lfs-row').count();
  const filteredLarge = await window.locator('#largeList .lfs-row').count();
  if (filteredLfs !== 0 || filteredLarge !== 1) {
    throw new Error(`LFS filter did not narrow both columns (LFS ${filteredLfs}, large ${filteredLarge}).`);
  }
  await window.locator('#tabSearchClear').click();
  await window.waitForFunction(() => document.querySelectorAll('#largeList .lfs-row').length === 1, null, { timeout: 5_000 });

  await window.locator('#tabSubmodules').click();
  await window.waitForSelector('#submodulesPanel.is-active .sub-row', { timeout: 15_000 });
  const submoduleCount = await window.locator('#submodulesList .sub-row').count();
  if (submoduleCount !== 1) throw new Error(`Expected 1 submodule, found ${submoduleCount}.`);
  const submoduleText = (await window.locator('#submodulesList').innerText()).toLowerCase();
  if (!submoduleText.includes('vendor/sub')) throw new Error('Submodule path was not listed.');
  if (!submoduleText.includes('up to date')) throw new Error('Submodule status is missing.');
  if (!submoduleText.includes('index')) throw new Error('Submodule index SHA is missing.');
  if (!submoduleText.includes('main')) throw new Error('Submodule branch is missing.');

  await window.locator('#tabSearch').fill('vendor');
  const filteredSubmodules = await window.locator('#submodulesList .sub-row').count();
  if (filteredSubmodules !== 1) throw new Error(`Submodule filter did not narrow the list (found ${filteredSubmodules}).`);
  await window.locator('#tabSearchClear').click();
  await window.waitForFunction(() => document.querySelectorAll('#submodulesList .sub-row').length === 1, null, { timeout: 5_000 });

  await window.locator('#tabStatistics').click();
  await window.waitForSelector('#statisticsPanel.is-active .stat-card', { timeout: 30_000 });
  const statCards = await window.locator('#statisticsBody .stat-card').count();
  if (statCards !== 6) throw new Error(`Expected 6 statistic cards, found ${statCards}.`);
  const statisticsText = (await window.locator('#statisticsBody').innerText()).toLowerCase();
  if (!statisticsText.includes('commits')) throw new Error('Commit statistics are missing.');
  if (!statisticsText.includes('tracked files')) throw new Error('Tracked-file statistics are missing.');
  if (!statisticsText.includes('languages')) throw new Error('Language statistics are missing.');
  if (!statisticsText.includes('contributors')) throw new Error('Contributor statistics are missing.');
  if (!statisticsText.includes('commit activity')) throw new Error('Commit activity is missing.');

  if (pageErrors.length) throw new Error(`Renderer error: ${pageErrors.join(' | ')}`);

  passed = true;
  console.log('GitGlance smoke test passed.');
  console.log(`  repository: ${path.basename(repoDir)}`);
  console.log(`  project list: ${projectCount} entry`);
  console.log(`  preview: ${previewText.split('\n')[0]}`);
  console.log(`  history: ${cleanHistory} commit`);
  console.log(`  worktrees: ${worktreeCount} linked`);
  console.log(`  remotes: ${remoteCount} configured`);
  console.log(`  branches: ${branchCount} listed`);
  console.log(`  tags: ${tagCount} listed`);
  console.log(`  stashes: ${stashCount} listed`);
  console.log(`  lfs: ${lfsFileCount} LFS / ${largeFileCount} large`);
  console.log(`  submodules: ${submoduleCount} listed`);
  console.log(`  statistics: ${statCards} cards`);
  console.log('  default tab: Chat');
  console.log('  tabs: Chat, Files, History, Worktrees, Remote, Branches, Tags, Stash, LFS, Submodules, Statistics');
} finally {
  if (app) await app.close().catch(() => {});
  await fs.rm(worktreeDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(submoduleSourceDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(submoduleRemoteDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(repoDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}

if (!passed) process.exit(1);
