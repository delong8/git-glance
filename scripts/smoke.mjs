/**
 * End-to-end smoke test against the built Electron app.
 *
 * It creates a temporary Git repository and a throwaway Electron profile,
 * launches GitGlance, then verifies the project list, file preview, and the
 * three-column chat workspace. Nothing in your real config or repositories is touched.
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
const piArgsPath = path.join(userDataDir, 'pi-args.txt');
const piStubPath = path.join(userDataDir, 'pi-stub.sh');

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.cwd || repoDir,
    env: { ...process.env, GIT_CONFIG_GLOBAL: gitConfigPath, GIT_CONFIG_NOSYSTEM: '1', ...(options.env || {}) },
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

  // Build an older side branch with enough commits to exercise Chat history paging.
  // Plumbing keeps the working tree untouched, and 2020 dates keep these commits
  // behind the main-branch commits in the newest-first history page.
  let bulkTip = git(['rev-list', '--max-parents=0', 'HEAD']);
  for (let index = 1; index <= 90; index += 1) {
    const stamp = new Date(Date.UTC(2020, 0, 1, 0, index)).toISOString();
    bulkTip = git([
      '-c', 'user.name=Smoke Test',
      '-c', 'user.email=smoke@example.com',
      'commit-tree', `${bulkTip}^{tree}`,
      '-p', bulkTip,
      '-m', `Bulk commit ${String(index).padStart(2, '0')}`
    ], { env: { GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp } });
  }
  git(['branch', 'smoke-bulk', bulkTip]);

  git(['tag', 'v1.0.0']);
  git(['tag', '-a', 'v1.1.0', '-m', 'Smoke release']);
  await fs.appendFile(path.join(repoDir, 'README.md'), '\nStash me.\n');
  git(['stash', 'push', '-m', 'Smoke stash']);
  await fs.mkdir(path.join(repoDir, 'docs'), { recursive: true });
  await fs.writeFile(path.join(repoDir, 'docs', 'notes.txt'), '# Notes\n\nChanged for the chat tree.\n');
  await fs.writeFile(path.join(repoDir, 'src', 'notes.ts'), 'export const notes = true;\n');
  git(['worktree', 'add', '-b', 'smoke-worktree', worktreeDir]);
  git(['remote', 'add', 'origin', 'https://example.com/acme/console.git']);
  git(['update-ref', 'refs/remotes/origin/main', git(['rev-parse', 'HEAD'])]);
  git(['update-ref', 'refs/remotes/origin/remote-only', git(['rev-parse', 'HEAD'])]);
  git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);

  // Pi stub: records its argv so the smoke can verify the system prompt flags,
  // then exits. The app still treats the binary as available.
  await fs.writeFile(piStubPath, `#!/bin/sh\nprintf '%s\\n' "$@" > '${piArgsPath}'\nexit 1\n`, { mode: 0o755 });

  app = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: gitConfigPath,
      GIT_CONFIG_NOSYSTEM: '1',
      GITGLANCE_USER_DATA: userDataDir,
      GITGLANCE_REPO: repoDir,
      GITGLANCE_DISABLE_SINGLE_INSTANCE: '1',
      PI_BIN: piStubPath
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
  await window.waitForSelector('#bootSplash.is-hidden', { state: 'attached', timeout: 20_000 });
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

  const openGroup = window.locator('.summary-group .btn.icon-only');
  if (await openGroup.count() !== 2) {
    throw new Error(`Expected 2 project open actions, found ${await openGroup.count()}.`);
  }
  if (!(await window.locator('[data-action="open-folder"]').getAttribute('title'))?.includes('Open folder')) {
    throw new Error('Open folder action is missing its label.');
  }
  if (!(await window.locator('[data-action="open-terminal"]').getAttribute('title'))?.includes('Open terminal')) {
    throw new Error('Open terminal action is missing its label.');
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

  await window.waitForSelector('#chatPanel.is-active .chat-welcome', { timeout: 10_000 });
  await window.waitForSelector('#chatHistoryList .chat-history-row', { timeout: 10_000 });
  const historyTotal = Number(git(['rev-list', '--count', '--branches', '--remotes', '--tags']));
  if (historyTotal <= 80) throw new Error(`Smoke repo history is too small to page (${historyTotal} commits).`);
  const chatHistoryRows = await window.locator('#chatHistoryList .chat-history-row').count();
  if (chatHistoryRows !== 80) throw new Error(`Chat history first page rendered ${chatHistoryRows} commits instead of 80.`);
  const chatHistorySub = await window.locator('#chatHistorySub').innerText();
  if (!chatHistorySub.includes(`80 of ${historyTotal}`)) {
    throw new Error(`Chat history subheader did not report the loaded window (got “${chatHistorySub}”).`);
  }
  await window.locator('#chatHistoryList').evaluate((list) => { list.scrollTop = list.scrollHeight; });
  await window.waitForFunction((total) => document.querySelectorAll('#chatHistoryList .chat-history-row').length === total, historyTotal, { timeout: 15_000 });
  const loadedHistorySub = await window.locator('#chatHistorySub').innerText();
  if (!loadedHistorySub.includes(`${historyTotal} commits`)) {
    throw new Error(`Chat history did not settle on the full count (got “${loadedHistorySub}”).`);
  }
  const chatTreeFolders = await window.locator('#chatChanges .tree-row.folder').count();
  const chatTreeFiles = await window.locator('#chatChanges .tree-row.file').count();
  if (chatTreeFolders < 2 || chatTreeFiles < 2) {
    throw new Error(`Changed file tree rendered ${chatTreeFolders} folders and ${chatTreeFiles} files.`);
  }
  if (!(await window.locator('#chatPanel').evaluate((panel) => panel.classList.contains('is-preview-closed')))) {
    throw new Error('Chat preview did not start closed.');
  }
  if (await window.locator('#chatDetail').isVisible()) throw new Error('Closed chat preview is still visible.');
  if (await window.locator('#chatChanges .tree-row.file.is-selected').count()) {
    throw new Error('A changed file is highlighted before the preview is opened.');
  }
  await window.locator('#chatChanges [data-chat-file="docs/notes.txt"]').click();
  await window.waitForFunction(() => !document.querySelector('#chatPanel')?.classList.contains('is-preview-closed'), null, { timeout: 10_000 });
  await window.waitForSelector('#chatDetail .diff-file', { timeout: 15_000 });
  const initialChatPreview = (await window.locator('#chatDetail .diff-file').innerText()).replace(/\s+/g, '');
  if (!initialChatPreview.includes('docs/notes.txt')) {
    throw new Error(`Chat preview did not open the clicked file (got “${initialChatPreview}”).`);
  }
  await window.locator('[data-action="hide-chat-preview"]').click();
  await window.waitForFunction(() => document.querySelector('#chatPanel')?.classList.contains('is-preview-closed'), null, { timeout: 10_000 });
  if (await window.locator('#chatDetail').isVisible()) throw new Error('Chat preview did not hide.');
  await window.locator('#chatChanges [data-chat-file="src/notes.ts"]').click();
  await window.waitForFunction(() => !document.querySelector('#chatPanel')?.classList.contains('is-preview-closed'), null, { timeout: 10_000 });
  await window.waitForFunction(() => document.querySelector('#chatDetail .diff-file')?.textContent?.includes('src/notes.ts'), null, { timeout: 10_000 });

  await window.locator('#tabFiles').click();
  await window.waitForSelector('#filesPanel.is-active', { timeout: 10_000 });
  await window.locator('[data-file="README.md"]').click();
  await window.waitForSelector('#diffPane .text-code', { timeout: 15_000 });
  const previewText = await window.locator('#diffPane .text-code').innerText();
  if (!previewText.includes('Smoke repository')) throw new Error('README preview did not load.');

  await window.locator('#tabChat').click();
  await window.waitForSelector('#chatPanel.is-active .chat-welcome', { timeout: 10_000 });
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
  if (!remoteText.includes('remote-only')) throw new Error('Remote-only branch was not listed.');
  if (!remoteText.includes('2 branches')) throw new Error('Remote branch count was not listed.');

  await window.locator('#tabSearch').fill('example.com');
  const filteredRemotes = await window.locator('#remotesList .remote-row').count();
  if (filteredRemotes !== 1) throw new Error(`Remote filter did not match the URL (found ${filteredRemotes}).`);
  await window.locator('#tabSearchClear').click();
  await window.waitForFunction(() => document.querySelectorAll('#remotesList .remote-row').length === 1, null, { timeout: 5_000 });

  await window.locator('#tabBranches').click();
  await window.waitForSelector('#branchesPanel.is-active .branch-row', { timeout: 10_000 });
  const branchCount = await window.locator('#branchesList .branch-row').count();
  if (branchCount !== 5) throw new Error(`Expected 5 branches, found ${branchCount}.`);
  const branchText = (await window.locator('#branchesList').innerText()).toLowerCase();
  if (!branchText.includes('smoke-worktree')) throw new Error('Local branch was not listed.');
  if (!branchText.includes('origin/main')) throw new Error('Remote-tracking branch was not listed.');
  if (!branchText.includes('origin/remote-only')) throw new Error('Remote-only branch was not listed.');
  if (!branchText.includes('current')) throw new Error('Current branch badge is missing.');
  if (!branchText.includes('remote')) throw new Error('Remote branch badge is missing.');

  await window.locator('#tabSearch').fill('smoke-worktree');
  const filteredBranches = await window.locator('#branchesList .branch-row').count();
  if (filteredBranches !== 1) throw new Error(`Branch filter did not narrow the list (found ${filteredBranches}).`);
  await window.locator('#tabSearchClear').click();
  await window.waitForFunction(() => document.querySelectorAll('#branchesList .branch-row').length === 5, null, { timeout: 5_000 });

  // Summary buttons: Stash and Branch.
  await window.locator('[data-action="branches"]').click();
  await window.waitForSelector('#branchBackdrop.is-open');
  const modalBranchCount = await window.locator('#branchPickList .branch-pick-row').count();
  if (modalBranchCount !== 5) throw new Error(`Branch modal listed ${modalBranchCount} branches, expected 5.`);
  await window.locator('[data-branch-base="origin/remote-only"]').click();
  await window.locator('#branchNameInput').fill('smoke-modal');
  await window.locator('#branchCreateBtn').click();
  await window.waitForFunction(() => !document.querySelector('#branchBackdrop')?.classList.contains('is-open'), null, { timeout: 15_000 });
  await window.waitForFunction(() => document.querySelector('.branch-pill')?.textContent?.includes('smoke-modal'), null, { timeout: 10_000 });
  if (git(['branch', '--show-current']) !== 'smoke-modal') {
    throw new Error('Creating a branch from the modal did not switch the repository.');
  }
  if (git(['rev-parse', '--abbrev-ref', 'smoke-modal@{upstream}']) !== 'origin/remote-only') {
    throw new Error('The branch created from a remote branch did not track it.');
  }

  // Switching to a remote-only branch creates a local tracking branch.
  await window.locator('[data-action="branches"]').click();
  await window.waitForSelector('#branchBackdrop.is-open');
  await window.locator('[data-branch-switch="origin/remote-only"]').click();
  await window.waitForFunction(() => !document.querySelector('#branchBackdrop')?.classList.contains('is-open'), null, { timeout: 15_000 });
  await window.waitForFunction(() => document.querySelector('.branch-pill')?.textContent?.trim() === 'remote-only', null, { timeout: 10_000 });
  if (git(['branch', '--show-current']) !== 'remote-only') {
    throw new Error('Switching to a remote branch did not create and check out the local branch.');
  }
  if (git(['rev-parse', '--abbrev-ref', 'remote-only@{upstream}']) !== 'origin/remote-only') {
    throw new Error('The local branch created for a remote branch does not track it.');
  }

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

  // Stash from the summary header.
  await fs.appendFile(path.join(repoDir, 'README.md'), '\nStash from the summary.\n');
  await window.locator('[data-action="refresh"]').click();
  await window.waitForFunction(() => document.querySelector('#filesBadge') && !document.querySelector('#filesBadge').hidden, null, { timeout: 15_000 });
  const stashButton = window.locator('[data-action="stash"]');
  await window.waitForFunction(() => {
    const button = document.querySelector('[data-action="stash"]');
    return button && !button.disabled;
  }, null, { timeout: 15_000 });
  await stashButton.click();
  await window.waitForFunction(() => document.querySelector('#filesBadge')?.hidden === true, null, { timeout: 15_000 });
  const stashEntries = git(['stash', 'list']).split('\n').filter(Boolean);
  if (stashEntries.length !== 2) {
    throw new Error(`Expected 2 stashes after using the summary button, found ${stashEntries.length}.`);
  }
  if (!stashEntries[0].includes('WIP on remote-only')) {
    throw new Error(`The summary stash was not created on the current branch: ${stashEntries[0]}`);
  }
  await window.locator('#tabStashes').click();
  await window.waitForFunction(() => document.querySelectorAll('#stashesList .stash-row').length === 2, null, { timeout: 10_000 });

  // Commit context menu in the Chat history column.
  await window.locator('#tabChat').click();
  await window.waitForSelector('#chatHistoryList .chat-history-row', { timeout: 10_000 });
  const targetCommit = window.locator('#chatHistoryList .chat-history-row[data-commit-message="Add submodule"]');
  await targetCommit.click({ button: 'right' });
  await window.waitForSelector('#commitMenu:not([hidden])', { timeout: 5_000 });
  const commitMenuLabels = await window.locator('#commitMenu .context-menu-label').allInnerTexts();
  for (const label of ['New Branch', 'New Tag', 'Cherry Pick Commit', 'Revert Commit', 'Squash into parent', 'Copy Commit SHA']) {
    if (!commitMenuLabels.includes(label)) throw new Error(`Commit menu is missing “${label}”.`);
  }
  if (!commitMenuLabels.some((label) => label.startsWith('Reset ') && label.endsWith(' to here'))) {
    throw new Error('Commit menu is missing the Reset action.');
  }
  const commitMenuSeps = await window.locator('#commitMenu .context-menu-sep').count();
  if (commitMenuSeps !== 3) {
    throw new Error(`Commit menu groups are not separated into four sections (found ${commitMenuSeps} separators).`);
  }
  const targetSha = await targetCommit.getAttribute('data-commit-sha');
  await window.locator('[data-commit-action="new-branch"]').click();
  await window.waitForSelector('#commitActionBackdrop.is-open', { timeout: 5_000 });
  await window.locator('#commitActionInput').fill('smoke-context');
  await window.locator('#commitActionConfirm').click();
  await window.waitForFunction(() => !document.querySelector('#commitActionBackdrop')?.classList.contains('is-open'), null, { timeout: 15_000 });
  if (git(['branch', '--list', 'smoke-context']) !== 'smoke-context') throw new Error('Commit menu did not create a branch.');
  if (git(['rev-parse', 'smoke-context']) !== targetSha) throw new Error('Commit menu created the branch at the wrong commit.');

  const tagCommit = window.locator('#chatHistoryList .chat-history-row[data-commit-message="Configure LFS"]');
  const tagSha = await tagCommit.getAttribute('data-commit-sha');
  await tagCommit.click({ button: 'right' });
  await window.waitForSelector('#commitMenu:not([hidden])', { timeout: 5_000 });
  await window.locator('[data-commit-action="new-tag"]').click();
  await window.waitForSelector('#commitActionBackdrop.is-open', { timeout: 5_000 });
  await window.locator('#commitActionInput').fill('smoke-context-tag');
  await window.locator('#commitActionConfirm').click();
  await window.waitForFunction(() => !document.querySelector('#commitActionBackdrop')?.classList.contains('is-open'), null, { timeout: 15_000 });
  if (git(['tag', '--list', 'smoke-context-tag']) !== 'smoke-context-tag') throw new Error('Commit menu did not create a tag.');
  if (git(['rev-parse', 'smoke-context-tag^{commit}']) !== tagSha) throw new Error('Commit menu created the tag at the wrong commit.');

  await targetCommit.click({ button: 'right' });
  await window.waitForSelector('#commitMenu:not([hidden])', { timeout: 5_000 });
  await window.locator('[data-commit-action="reset"]').click();
  await window.waitForSelector('#commitActionBackdrop.is-open', { timeout: 5_000 });
  const resetTitle = await window.locator('#commitActionTitle').innerText();
  if (!resetTitle.includes('remote-only')) throw new Error(`Reset modal is missing the branch name: ${resetTitle}`);
  if (await window.locator('.reset-choice').count() !== 3) throw new Error('Reset modal is missing Soft/Mixed/Hard.');
  await window.locator('#commitActionCancel').click();
  await window.waitForFunction(() => !document.querySelector('#commitActionBackdrop')?.classList.contains('is-open'), null, { timeout: 5_000 });

  if (await window.locator('#chatHistoryList .chat-history-row').count() < historyTotal) {
    await window.locator('#chatHistoryList').evaluate((list) => { list.scrollTop = list.scrollHeight; });
    await window.waitForFunction((total) => document.querySelectorAll('#chatHistoryList .chat-history-row').length === total, historyTotal, { timeout: 15_000 });
  }
  const rootCommit = window.locator('#chatHistoryList .chat-history-row').last();
  await rootCommit.click({ button: 'right' });
  await window.waitForSelector('#commitMenu:not([hidden])', { timeout: 5_000 });
  if (!(await window.locator('[data-commit-action="squash"]').isDisabled())) {
    throw new Error('Squash is enabled for the root commit.');
  }
  await window.keyboard.press('Escape');
  await window.waitForFunction(() => document.querySelector('#commitMenu')?.hidden === true, null, { timeout: 5_000 });

  // Prompts settings: system prompt, custom chips, and Pi spawn arguments.
  await window.locator('#openSettings').click();
  await window.waitForSelector('#settingsBackdrop.is-open', { timeout: 10_000 });
  await window.locator('#setLlmProvider').fill('smoke-provider');
  await window.locator('#setLlmModel').fill('smoke-model');
  await window.locator('#setLlmBaseUrl').fill('http://127.0.0.1:1/v1');
  await window.locator('#setSystemPrompt').fill('SMOKE-SYSTEM-PROMPT: keep answers brief.');
  await window.locator('#addCustomPrompt').click();
  await window.locator('#customPromptList [data-prompt-input]').first().fill('Summarize the staged files.');
  await window.locator('#settingsSave').click();
  await window.waitForFunction(() => !document.querySelector('#settingsBackdrop')?.classList.contains('is-open'), null, { timeout: 15_000 });
  await window.waitForSelector('#chatContextRow .chat-prompt-chip', { timeout: 10_000 });
  const promptChips = await window.locator('#chatContextRow .chat-prompt-chip').count();
  if (promptChips !== 1) throw new Error(`Expected 1 custom prompt chip, found ${promptChips}.`);
  const savedConfig = JSON.parse(await fs.readFile(path.join(userDataDir, 'config.json'), 'utf8'));
  if (savedConfig.ui.systemPrompt !== 'SMOKE-SYSTEM-PROMPT: keep answers brief.') {
    throw new Error('The system prompt was not persisted to config.json.');
  }
  if (!Array.isArray(savedConfig.ui.customPrompts) || savedConfig.ui.customPrompts[0] !== 'Summarize the staged files.') {
    throw new Error('Custom prompts were not persisted to config.json.');
  }
  await window.locator('#chatContextRow .chat-prompt-chip').first().click();
  await window.waitForFunction(() => document.querySelectorAll('#chatThread .chat-msg.user').length >= 1, null, { timeout: 10_000 });
  let piArgs = '';
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      piArgs = await fs.readFile(piArgsPath, 'utf8');
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  const piArgv = piArgs.split('\n').filter(Boolean);
  if (piArgv.filter((arg) => arg === '--append-system-prompt').length !== 2) {
    throw new Error('Pi was not spawned with both the built-in and user system prompts.');
  }
  if (!piArgv.includes('SMOKE-SYSTEM-PROMPT: keep answers brief.')) {
    throw new Error('Pi was not spawned with the configured system prompt.');
  }
  if (!piArgv.some((arg) => arg.startsWith('You are GitGlance AI'))) {
    throw new Error('Pi was not spawned with the built-in system prompt.');
  }

  if (pageErrors.length) throw new Error(`Renderer error: ${pageErrors.join(' | ')}`);

  passed = true;
  console.log('GitGlance smoke test passed.');
  console.log(`  repository: ${path.basename(repoDir)}`);
  console.log(`  project list: ${projectCount} entry`);
  console.log(`  preview: ${previewText.split('\n')[0]}`);
  console.log(`  worktrees: ${worktreeCount} linked`);
  console.log(`  remotes: ${remoteCount} configured`);
  console.log(`  branches: ${branchCount} listed, modal create + remote switch verified`);
  console.log(`  tags: ${tagCount} listed`);
  console.log(`  stashes: ${stashCount} listed + 1 summary stash`);
  console.log(`  lfs: ${lfsFileCount} LFS / ${largeFileCount} large`);
  console.log(`  submodules: ${submoduleCount} listed`);
  console.log(`  statistics: ${statCards} cards`);
  console.log('  default tab: Chat');
  console.log(`  chat: ${chatHistoryRows} first page → ${historyTotal} paged commits, ${chatTreeFiles} changed files in the tree`);
  console.log('  commit menu: branch, tag, reset and squash guard verified');
  console.log('  prompts: system + custom chip persisted, Pi spawned with both system prompts');
  console.log('  project actions: open folder + open terminal');
  console.log('  tabs: Chat, Files, Worktrees, Remote, Branches, Tags, Stash, LFS, Submodules, Statistics');
} finally {
  if (app) await app.close().catch(() => {});
  await fs.rm(worktreeDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(submoduleSourceDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(submoduleRemoteDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(repoDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}

if (!passed) process.exit(1);
