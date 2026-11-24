import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, protocol, shell } from 'electron';
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import { execFile, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { ConfigStore, isLanguage, isThemeMode, normalizeLlmSettings, normalizeZoom } from './lib/config.cjs';
import * as git from './lib/git.cjs';
import { PreviewService } from './lib/preview.cjs';
import { PiService } from './lib/pi.cjs';
import type {
  AppSettings,
  AutoFetchInterval,
  Bootstrap,
  CommitResult,
  DownloadReportResult,
  FileDiff,
  GitBranchInfo,
  GitCheckoutResult,
  GitLfsReport,
  GitRemoteInfo,
  GitStashInfo,
  GitSubmoduleInfo,
  GitTagCheckoutResult,
  GitTagInfo,
  GitWorktree,
  LlmSettings,
  PiSendResult,
  PreviewData,
  PullStrategy,
  RepoSnapshot,
  RepoStatistics,
  RepoSummary,
  SettingsInput,
  StashAction,
  ThemeMode,
  Language
} from './shared/models.js';
import type {
  FetchOptions,
  IpcEnvelope,
  MenuAction,
  OpenRepositoryResult,
  OpenSubmoduleResult,
  OpenWorktreeResult,
  RepoSummariesResult,
  SaveSettingsResult
} from './shared/ipc.js';

if (process.env.GITGLANCE_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.GITGLANCE_USER_DATA));
}

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const isDev = !!devServerUrl;
const distDir = path.join(__dirname, '..', 'dist');
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json'
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
]);

let mainWindow: BrowserWindow | null = null;
let config!: ConfigStore;
let previewService!: PreviewService;
let piService!: PiService;

const DARK_WINDOW_BACKGROUND = '#080a0e';
const LIGHT_WINDOW_BACKGROUND = '#f4f6fa';
const AUTO_FETCH_INTERVALS: readonly AutoFetchInterval[] = ['off', '5', '15', '30', '60'];
const PULL_STRATEGIES: readonly PullStrategy[] = ['merge', 'rebase', 'ff-only'];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function windowBackground(theme: ThemeMode): string {
  if (theme === 'light') return LIGHT_WINDOW_BACKGROUND;
  if (theme === 'dark') return DARK_WINDOW_BACKGROUND;
  return nativeTheme.shouldUseDarkColors ? DARK_WINDOW_BACKGROUND : LIGHT_WINDOW_BACKGROUND;
}

/**
 * Keep the native window backing color in step with the chosen theme so
 * resizing and first paint never flash the wrong shade.
 */
function syncWindowBackground(theme: ThemeMode): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(windowBackground(theme));
  }
}

/** Apply the stored interface zoom (null means 1.0) to every open window. */
function applyZoomToWindows(zoom: number | null): void {
  const factor = zoom ?? 1;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.setZoomFactor(factor);
  }
}

function currentLanguage(): Language {
  return config && config.getUiSettings().language === 'zh-CN' ? 'zh-CN' : 'en';
}

/** English/Chinese text for native-only chrome (menus, dialogs). */
function mt(en: string, zh: string): string {
  return currentLanguage() === 'zh-CN' ? zh : en;
}

function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function registerAppProtocol(): void {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'bundle') return new Response('Not found', { status: 404 });
      let rel = decodeURIComponent(url.pathname);
      if (!rel || rel === '/') rel = '/index.html';
      const filePath = path.normalize(path.join(distDir, rel));
      if (filePath !== distDir && !filePath.startsWith(distDir + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }
      const data = await fs.readFile(filePath);
      const mime = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      return new Response(data, {
        status: 200,
        headers: {
          'content-type': mime,
          'cache-control': 'no-cache'
        }
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

async function getBootstrap(): Promise<Bootstrap> {
  const gitConfig = await git.readGlobalGitConfig();
  const ui = config.getUiSettings();
  const configuredRepos = config.getRepos();
  const summaries = await Promise.all(configuredRepos.map(async (repoPath): Promise<RepoSummary> => {
    try {
      return await git.getRepoSummary(repoPath);
    } catch (error) {
      return {
        path: repoPath,
        name: path.basename(repoPath),
        error: errorMessage(error),
        branch: '',
        detached: false,
        upstream: null,
        ahead: 0,
        behind: 0,
        changedCount: 0,
        stagedCount: 0,
        unstagedCount: 0,
        lastFetch: null,
        remotes: [],
        files: []
      };
    }
  }));

  let activeRepo = config.getActiveRepo();
  if (activeRepo && !summaries.some((repo) => repo.path === activeRepo)) {
    activeRepo = summaries[0]?.path || null;
  }
  if (!activeRepo) activeRepo = summaries[0]?.path || null;

  const settings: AppSettings = {
    ...gitConfig,
    ...ui,
    name: gitConfig.name || '',
    email: gitConfig.email || '',
    llm: config.getLlmSettings()
  };

  return {
    repos: summaries,
    activeRepo,
    settings,
    currentUser: {
      name: gitConfig.name || 'Developer',
      email: gitConfig.email || ''
    },
    pi: piService.getStatus(),
    platform: process.platform,
    home: app.getPath('home'),
    appVersion: app.getVersion(),
    configPath: config.file
  };
}

type IpcHandler<Args extends unknown[], Result> = (...args: Args) => Result | Promise<Result>;

function wrapHandler<Args extends unknown[], Result>(fn: IpcHandler<Args, Result>) {
  return async (event: IpcMainInvokeEvent, ...args: unknown[]): Promise<IpcEnvelope<Result>> => {
    try {
      if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
        throw new Error('Unknown sender');
      }
      const data = await fn(...(args as Args));
      return { ok: true, data };
    } catch (error) {
      console.error('[GitGlance IPC]', error);
      return { ok: false, error: errorMessage(error) };
    }
  };
}

function assertKnownRepo(repoPath: unknown): string {
  if (!repoPath || typeof repoPath !== 'string') throw new Error('Missing repository path');
  const normalized = path.resolve(repoPath);
  if (!config.getRepos().includes(normalized)) {
    throw new Error('Repository is not part of this workspace');
  }
  return normalized;
}

async function buildPiPrompt(repoPath: string, message: string, selectedFile: string | null): Promise<string> {
  let context = '';
  try {
    const [branchInfo, files, history, unstagedDiff, stagedDiff] = await Promise.all([
      git.getBranchInfo(repoPath),
      git.getStatusFiles(repoPath),
      git.getHistory(repoPath, 8),
      git.runGit(repoPath, ['diff', '--no-color', '--unified=2'], { allowFailure: true, maxBuffer: 16 * 1024 * 1024 }),
      git.runGit(repoPath, ['diff', '--cached', '--no-color', '--unified=2'], { allowFailure: true, maxBuffer: 16 * 1024 * 1024 })
    ]);

    const changed = files.length
      ? files.slice(0, 40).map((file) => {
        const flags = [file.staged ? 'staged' : 'unstaged'];
        if (file.binary) flags.push('binary');
        return `- [${file.status}] ${file.path} (${flags.join(', ')}, +${file.add || 0} -${file.del || 0})`;
      }).join('\n')
      : '(working tree is clean)';

    const commits = history.length
      ? history.map((commit) => `- ${commit.sha.slice(0, 7)} ${commit.message} — ${commit.author}, ${commit.when}`).join('\n')
      : '(no commits yet)';

    const trimDiff = (text: string, label: string): string => {
      if (!text || !text.trim()) return '';
      const clipped = text.length > 22_000 ? `${text.slice(0, 22_000)}\n… [diff truncated]` : text;
      return `\n### ${label}\n${clipped}\n`;
    };

    context = `Repository: ${repoPath}
Current branch: ${branchInfo.branch}${branchInfo.detached ? ' (detached)' : ''}
Upstream: ${branchInfo.upstream || 'none'}
Ahead/behind: ${branchInfo.ahead}/${branchInfo.behind}
Selected file: ${selectedFile || 'none'}

changed files:
${changed}

recent commits:
${commits}
${trimDiff(stagedDiff.stdout, 'staged diff')}${trimDiff(unstagedDiff.stdout, 'unstaged diff')}`;
  } catch (error) {
    context = `Repository: ${repoPath}\nGit context could not be loaded: ${errorMessage(error)}`;
  }

  return `You are answering inside GitGlance, a local Git client. The user is looking at the repository below. Use the read-only tools when you need more detail. Do not modify files.

<repository_context>
${context}
</repository_context>

User request:
${message}`;
}

const execFileAsync = promisify(execFile);

async function openTerminal(repoPath: string): Promise<void> {
  if (process.platform === 'darwin') {
    await execFileAsync('open', ['-a', 'Terminal', repoPath], { timeout: 15_000 });
    return;
  }
  if (process.platform === 'win32') {
    await execFileAsync('cmd.exe', ['/c', 'start', '', 'cmd.exe'], {
      cwd: repoPath,
      timeout: 15_000,
      windowsHide: false
    });
    return;
  }
  const terminals = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'];
  for (const terminal of terminals) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(terminal, [], { cwd: repoPath, detached: true, stdio: 'ignore' });
        child.once('error', reject);
        child.once('spawn', () => {
          child.unref();
          resolve();
        });
      });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new Error('No terminal emulator was found');
}

function registerIpc(): void {
  ipcMain.handle('app:bootstrap', wrapHandler(async (): Promise<Bootstrap> => getBootstrap()));

  ipcMain.handle('repo:open', wrapHandler(async (): Promise<OpenRepositoryResult> => {
    if (!mainWindow) throw new Error('No application window is available');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: mt('Open a Git repository', '打开 Git 仓库'),
      buttonLabel: mt('Open repository', '打开仓库'),
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const normalized = await git.normalizeRepo(result.filePaths[0]);
    await git.getRepoSummary(normalized);
    await config.addRepo(normalized);
    return { canceled: false, path: normalized, bootstrap: await getBootstrap() };
  }));

  ipcMain.handle('repo:select', wrapHandler(async (repoPath: unknown): Promise<{ path: string }> => {
    const known = assertKnownRepo(repoPath);
    await config.setActiveRepo(known);
    return { path: known };
  }));

  ipcMain.handle('repo:remove', wrapHandler(async (repoPath: unknown): Promise<{ bootstrap: Bootstrap }> => {
    const known = assertKnownRepo(repoPath);
    piService.close(known);
    await config.removeRepo(known);
    return { bootstrap: await getBootstrap() };
  }));

  ipcMain.handle('repo:snapshot', wrapHandler(async (repoPath: unknown): Promise<RepoSnapshot> => {
    const known = assertKnownRepo(repoPath);
    return git.getSnapshot(known);
  }));

  ipcMain.handle('repo:worktrees', wrapHandler(async (repoPath: unknown): Promise<GitWorktree[]> => {
    const known = assertKnownRepo(repoPath);
    return git.getWorktrees(known);
  }));

  ipcMain.handle('worktree:open', wrapHandler(async (repoPath: unknown, worktreePath: unknown): Promise<OpenWorktreeResult> => {
    const known = assertKnownRepo(repoPath);
    const target = String(worktreePath || '');
    const worktrees = await git.getWorktrees(known);
    const worktree = worktrees.find((entry) => entry.path === target);
    if (!worktree) throw new Error(mt('That worktree no longer exists', '该工作树已不存在'));
    if (worktree.prunable) throw new Error(mt('This worktree is prunable and cannot be opened', '此工作树已标记为可清理，无法打开'));
    await git.getRepoSummary(worktree.path);
    await config.addRepo(worktree.path);
    return { path: worktree.path, bootstrap: await getBootstrap() };
  }));

  ipcMain.handle('worktree:reveal', wrapHandler(async (repoPath: unknown, worktreePath: unknown): Promise<true> => {
    const known = assertKnownRepo(repoPath);
    const target = String(worktreePath || '');
    const worktrees = await git.getWorktrees(known);
    if (!worktrees.some((entry) => entry.path === target)) throw new Error(mt('That worktree no longer exists', '该工作树已不存在'));
    shell.showItemInFolder(target);
    return true;
  }));

  ipcMain.handle('repo:remotes', wrapHandler(async (repoPath: unknown): Promise<GitRemoteInfo[]> => {
    const known = assertKnownRepo(repoPath);
    return git.getRemoteDetails(known);
  }));

  ipcMain.handle('git:fetch-remote', wrapHandler(async (repoPath: unknown, remoteName: unknown, prune: unknown): Promise<string> => {
    const known = assertKnownRepo(repoPath);
    return git.fetchRemote(known, String(remoteName || ''), prune !== false);
  }));

  ipcMain.handle('repo:branches', wrapHandler(async (repoPath: unknown): Promise<GitBranchInfo[]> => {
    const known = assertKnownRepo(repoPath);
    return git.getBranches(known);
  }));

  ipcMain.handle('git:checkout-branch', wrapHandler(async (repoPath: unknown, branchName: unknown): Promise<GitCheckoutResult> => {
    const known = assertKnownRepo(repoPath);
    return git.checkoutBranch(known, String(branchName || ''));
  }));

  ipcMain.handle('git:create-branch', wrapHandler(async (repoPath: unknown, branchName: unknown, startPoint: unknown): Promise<GitCheckoutResult> => {
    const known = assertKnownRepo(repoPath);
    return git.createBranch(known, String(branchName || ''), String(startPoint || ''));
  }));

  ipcMain.handle('git:stash-changes', wrapHandler(async (repoPath: unknown): Promise<string> => {
    const known = assertKnownRepo(repoPath);
    return git.stashChanges(known);
  }));

  ipcMain.handle('repo:tags', wrapHandler(async (repoPath: unknown): Promise<GitTagInfo[]> => {
    const known = assertKnownRepo(repoPath);
    return git.getTags(known);
  }));

  ipcMain.handle('git:checkout-tag', wrapHandler(async (repoPath: unknown, tagName: unknown): Promise<GitTagCheckoutResult> => {
    const known = assertKnownRepo(repoPath);
    return git.checkoutTag(known, String(tagName || ''));
  }));

  ipcMain.handle('repo:stashes', wrapHandler(async (repoPath: unknown): Promise<GitStashInfo[]> => {
    const known = assertKnownRepo(repoPath);
    return git.getStashes(known);
  }));

  ipcMain.handle('git:stash-action', wrapHandler(async (repoPath: unknown, ref: unknown, action: unknown): Promise<string> => {
    const known = assertKnownRepo(repoPath);
    return git.runStashAction(known, String(ref || ''), action as StashAction);
  }));

  ipcMain.handle('repo:lfs', wrapHandler(async (repoPath: unknown): Promise<GitLfsReport> => {
    const known = assertKnownRepo(repoPath);
    return git.getLfsReport(known);
  }));

  ipcMain.handle('repo:submodules', wrapHandler(async (repoPath: unknown): Promise<GitSubmoduleInfo[]> => {
    const known = assertKnownRepo(repoPath);
    return git.getSubmodules(known);
  }));

  ipcMain.handle('git:submodule-update', wrapHandler(async (repoPath: unknown, submodulePath: unknown): Promise<string> => {
    const known = assertKnownRepo(repoPath);
    return git.updateSubmodule(known, String(submodulePath || ''));
  }));

  ipcMain.handle('submodule:open', wrapHandler(async (repoPath: unknown, submodulePath: unknown): Promise<OpenSubmoduleResult> => {
    const known = assertKnownRepo(repoPath);
    const target = String(submodulePath || '');
    const submodules = await git.getSubmodules(known);
    const submodule = submodules.find((entry) => entry.path === target);
    if (!submodule) throw new Error(mt('That submodule no longer exists', '该子模块已不存在'));
    if (!submodule.headSha) throw new Error(mt('Submodule is not initialized', '子模块尚未初始化'));
    const absolute = path.resolve(known, target);
    await git.getRepoSummary(absolute);
    await config.addRepo(absolute);
    return { path: absolute, bootstrap: await getBootstrap() };
  }));

  ipcMain.handle('repo:statistics', wrapHandler(async (repoPath: unknown): Promise<RepoStatistics> => {
    const known = assertKnownRepo(repoPath);
    return git.getStatistics(known);
  }));

  ipcMain.handle('stats:download', wrapHandler(async (repoPath: unknown, html: unknown): Promise<DownloadReportResult> => {
    const known = assertKnownRepo(repoPath);
    if (typeof html !== 'string' || !html.trim()) throw new Error(mt('Report is empty', '报告为空'));
    if (!mainWindow) throw new Error('No application window is available');
    const base = path.basename(known).replace(/[^\w.-]+/g, '-') || 'repository';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: mt('Save statistics report', '保存统计报告'),
      buttonLabel: mt('Save report', '保存报告'),
      defaultPath: path.join(app.getPath('downloads'), `${base}-statistics.html`),
      filters: [{ name: 'HTML', extensions: ['html'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, html, 'utf8');
    return { canceled: false, path: result.filePath };
  }));

  ipcMain.handle('repo:summaries', wrapHandler(async (): Promise<RepoSummariesResult> => {
    const bootstrap = await getBootstrap();
    return { repos: bootstrap.repos, activeRepo: bootstrap.activeRepo };
  }));

  ipcMain.handle('git:stage', wrapHandler(async (repoPath: unknown, filePath: unknown): Promise<true> => {
    const known = assertKnownRepo(repoPath);
    await git.stageFile(known, String(filePath));
    return true;
  }));
  ipcMain.handle('git:unstage', wrapHandler(async (repoPath: unknown, filePath: unknown): Promise<true> => {
    const known = assertKnownRepo(repoPath);
    await git.unstageFile(known, String(filePath));
    return true;
  }));
  ipcMain.handle('git:stage-all', wrapHandler(async (repoPath: unknown): Promise<true> => {
    await git.stageAll(assertKnownRepo(repoPath));
    return true;
  }));
  ipcMain.handle('git:unstage-all', wrapHandler(async (repoPath: unknown): Promise<true> => {
    await git.unstageAll(assertKnownRepo(repoPath));
    return true;
  }));
  ipcMain.handle('git:commit', wrapHandler(async (repoPath: unknown, message: unknown): Promise<CommitResult> => {
    const known = assertKnownRepo(repoPath);
    return git.commit(known, String(message));
  }));
  ipcMain.handle('git:fetch', wrapHandler(async (repoPath: unknown, options: FetchOptions = {}): Promise<string> => {
    const known = assertKnownRepo(repoPath);
    return git.fetchRepo(known, { all: !!options.all, prune: options.prune !== false });
  }));
  ipcMain.handle('git:pull', wrapHandler(async (repoPath: unknown, strategy: PullStrategy = 'merge'): Promise<string> => {
    const known = assertKnownRepo(repoPath);
    return git.pullRepo(known, strategy);
  }));
  ipcMain.handle('git:push', wrapHandler(async (repoPath: unknown): Promise<string> => {
    return git.pushRepo(assertKnownRepo(repoPath));
  }));
  ipcMain.handle('git:diff', wrapHandler(async (repoPath: unknown, filePath: unknown, staged: unknown): Promise<FileDiff> => {
    const known = assertKnownRepo(repoPath);
    return git.getFileDiff(known, String(filePath), !!staged);
  }));

  ipcMain.handle('preview:file', wrapHandler(async (repoPath: unknown, filePath: unknown): Promise<PreviewData> => {
    const known = assertKnownRepo(repoPath);
    return previewService.previewFile(known, String(filePath));
  }));
  ipcMain.handle('app:open-repo-folder', wrapHandler(async (repoPath: unknown): Promise<true> => {
    const known = assertKnownRepo(repoPath);
    const result = await shell.openPath(known);
    if (result) throw new Error(result);
    return true;
  }));
  ipcMain.handle('app:open-repo-terminal', wrapHandler(async (repoPath: unknown): Promise<true> => {
    const known = assertKnownRepo(repoPath);
    await openTerminal(known);
    return true;
  }));
  ipcMain.handle('preview:open', wrapHandler(async (repoPath: unknown, filePath: unknown): Promise<true> => {
    const known = assertKnownRepo(repoPath);
    const absolute = git.validateRelativePath(known, String(filePath));
    const result = await shell.openPath(absolute);
    if (result) throw new Error(result);
    return true;
  }));
  ipcMain.handle('preview:reveal', wrapHandler(async (repoPath: unknown, filePath: unknown): Promise<true> => {
    const known = assertKnownRepo(repoPath);
    const absolute = git.validateRelativePath(known, String(filePath));
    shell.showItemInFolder(absolute);
    return true;
  }));
  ipcMain.handle('app:open-external', wrapHandler(async (url: string): Promise<true> => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Only http(s) links can be opened');
    }
    await shell.openExternal(url);
    return true;
  }));

  ipcMain.handle('settings:save', wrapHandler(async (settings: SettingsInput): Promise<SaveSettingsResult> => {
    const name = String(settings.name || '').trim();
    const email = String(settings.email || '').trim();
    if (!name) throw new Error(mt('A Git author name is required', '需要 Git 作者姓名'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(mt('Enter a valid commit email', '请输入有效的提交邮箱'));
    const pullStrategy: PullStrategy = PULL_STRATEGIES.includes(settings.pullStrategy) ? settings.pullStrategy : 'merge';
    const updated = await git.writeGitConfig({
      name,
      email,
      defaultBranch: String(settings.defaultBranch || 'main').trim() || 'main',
      editor: String(settings.editor || 'nvim').trim() || 'nvim',
      pullStrategy,
      sign: !!settings.sign,
      gpgKey: String(settings.gpgKey || '').trim(),
      prune: !!settings.prune
    });
    const autoFetch: AutoFetchInterval = AUTO_FETCH_INTERVALS.includes(settings.autoFetch) ? settings.autoFetch : '15';
    const previousLanguage = config.getUiSettings().language;
    const ui = await config.updateUiSettings({
      autoFetch,
      fetchAll: !!settings.fetchAll,
      theme: isThemeMode(settings.theme) ? settings.theme : config.getUiSettings().theme,
      language: isLanguage(settings.language) ? settings.language : config.getUiSettings().language
    });
    const llm: LlmSettings = await config.updateLlmSettings(normalizeLlmSettings(settings.llm));
    piService.setLlmSettings(llm);
    syncWindowBackground(ui.theme);
    if (ui.language !== previousLanguage) createApplicationMenu();
    const merged = await getBootstrap();
    return {
      settings: { ...merged.settings, ...updated, ...ui, llm },
      currentUser: merged.currentUser,
      pi: piService.getStatus()
    };
  }));

  ipcMain.handle('settings:theme', wrapHandler(async (theme: unknown): Promise<ThemeMode> => {
    const mode: ThemeMode = isThemeMode(theme) ? theme : 'dark';
    const ui = await config.updateUiSettings({ theme: mode });
    syncWindowBackground(ui.theme);
    return ui.theme;
  }));

  ipcMain.handle('settings:language', wrapHandler(async (language: unknown): Promise<Language> => {
    const next: Language = isLanguage(language) ? language : 'en';
    const ui = await config.updateUiSettings({ language: next });
    createApplicationMenu();
    return ui.language;
  }));

  ipcMain.handle('settings:zoom', wrapHandler(async (zoom: unknown): Promise<number | null> => {
    const next = normalizeZoom(zoom);
    const ui = await config.updateUiSettings({ zoom: next });
    applyZoomToWindows(ui.zoom);
    return ui.zoom;
  }));

  ipcMain.handle('pi:send', wrapHandler(async (repoPath: unknown, message: unknown, selectedFile: unknown): Promise<PiSendResult> => {
    const known = assertKnownRepo(repoPath);
    if (typeof message !== 'string' || !message.trim()) throw new Error('Message is empty');
    const selected = typeof selectedFile === 'string' && selectedFile ? selectedFile : null;
    if (selected) git.validateRelativePath(known, selected);
    const prompt = await buildPiPrompt(known, message.trim(), selected);
    return piService.send(known, prompt);
  }));
  ipcMain.handle('pi:abort', wrapHandler(async (repoPath: unknown) => piService.abort(assertKnownRepo(repoPath))));
  ipcMain.handle('pi:reset', wrapHandler(async (repoPath: unknown) => piService.reset(assertKnownRepo(repoPath))));
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 700,
    show: false,
    backgroundColor: windowBackground(config.getUiSettings().theme),
    title: 'GitGlance',
    ...(process.platform === 'darwin'
      ? {
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 16 }
      }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  mainWindow = window;

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('app://bundle/');
    if (!allowed) event.preventDefault();
  });
  window.webContents.on('did-finish-load', () => {
    if (window.isDestroyed()) return;
    window.webContents.setZoomFactor(config.getUiSettings().zoom ?? 1);
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadURL('app://bundle/index.html');
  }
}

function createApplicationMenu(): void {
  const isMac = process.platform === 'darwin';
  const sendMenu = (action: MenuAction): void => sendToRenderer('app:menu', action);
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const, label: mt('About GitGlance', '关于 GitGlance') },
        { type: 'separator' as const },
        { label: mt('Settings…', '设置…'), accelerator: 'Cmd+,', click: () => sendMenu('settings') },
        { type: 'separator' as const },
        { role: 'services' as const, label: mt('Services', '服务') },
        { type: 'separator' as const },
        { role: 'hide' as const, label: mt('Hide GitGlance', '隐藏 GitGlance') },
        { role: 'hideOthers' as const, label: mt('Hide Others', '隐藏其他') },
        { role: 'unhide' as const, label: mt('Show All', '全部显示') },
        { type: 'separator' as const },
        { role: 'quit' as const, label: mt('Quit GitGlance', '退出 GitGlance') }
      ]
    } satisfies MenuItemConstructorOptions] : []),
    {
      label: mt('File', '文件'),
      submenu: [
        { label: mt('Open Repository…', '打开仓库…'), accelerator: 'CmdOrCtrl+O', click: () => sendMenu('open-repository') },
        { label: mt('Remove Current Repository…', '移除当前仓库…'), click: () => sendMenu('remove-repository') },
        { type: 'separator' },
        ...(isMac ? [{ role: 'close' as const, label: mt('Close Window', '关闭窗口') }] : [{ role: 'quit' as const, label: mt('Quit', '退出') }])
      ]
    },
    {
      label: mt('Edit', '编辑'),
      submenu: [
        { role: 'undo', label: mt('Undo', '撤销') },
        { role: 'redo', label: mt('Redo', '重做') },
        { type: 'separator' },
        { role: 'cut', label: mt('Cut', '剪切') },
        { role: 'copy', label: mt('Copy', '复制') },
        { role: 'paste', label: mt('Paste', '粘贴') },
        { role: 'selectAll', label: mt('Select All', '全选') }
      ]
    },
    {
      label: mt('View', '视图'),
      submenu: [
        { label: mt('Refresh Repository', '刷新仓库'), accelerator: 'CmdOrCtrl+R', click: () => sendMenu('refresh') },
        { type: 'separator' },
        { role: 'resetZoom', label: mt('Actual Size', '实际大小') },
        { role: 'zoomIn', label: mt('Zoom In', '放大') },
        { role: 'zoomOut', label: mt('Zoom Out', '缩小') },
        ...(isDev ? [{ type: 'separator' as const }, { role: 'toggleDevTools' as const, label: mt('Toggle Developer Tools', '切换开发者工具') }] : [])
      ]
    },
    {
      label: mt('Window', '窗口'),
      submenu: [
        { role: 'minimize', label: mt('Minimize', '最小化') },
        { role: 'zoom', label: mt('Zoom', '缩放') },
        { type: 'separator' },
        { role: 'front', label: mt('Bring All to Front', '前置全部窗口') }
      ]
    },
    {
      role: 'help',
      label: mt('Help', '帮助'),
      submenu: [
        {
          label: mt('About GitGlance', '关于 GitGlance'),
          click: () => {
            if (!mainWindow) return;
            void dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'GitGlance',
              message: `GitGlance ${app.getVersion()}`,
              detail: mt(
                'A local Git client with Pi AI chat and rich previews.\n\nGit operations run through the installed Git CLI. Office previews use LibreOffice.',
                '本地 Git 客户端，内置 Pi AI 对话和丰富的预览功能。\n\nGit 操作通过已安装的 Git CLI 执行。Office 预览需要 LibreOffice。'
              )
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function addReposFromArgs(): Promise<void> {
  const args = process.argv.slice(2);
  const candidates: string[] = [];
  if (process.env.GITGLANCE_REPO) candidates.push(process.env.GITGLANCE_REPO);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === '--repo' && args[i + 1]) {
      candidates.push(args[++i]);
    } else if (arg.startsWith('--repo=')) {
      candidates.push(arg.slice('--repo='.length));
    }
  }
  for (const candidate of candidates) {
    try {
      const root = await git.normalizeRepo(candidate);
      await git.getRepoSummary(root);
      await config.addRepo(root);
    } catch (error) {
      console.warn(`[GitGlance] Could not open repository "${candidate}":`, errorMessage(error));
    }
  }
}

const gotLock = process.env.GITGLANCE_DISABLE_SINGLE_INSTANCE === '1'
  ? true
  : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setName('GitGlance');
    registerAppProtocol();
    config = new ConfigStore(app.getPath('userData'));
    await config.load();
    nativeTheme.on('updated', () => {
      // The system changed appearance; only "system" mode should follow it.
      if (config && config.getUiSettings().theme === 'system') {
        syncWindowBackground('system');
      }
    });
    previewService = new PreviewService({
      cacheDir: path.join(app.getPath('userData'), 'preview-cache'),
      tempDir: app.getPath('temp')
    });
    await previewService.init();
    piService = new PiService({
      onEvent: (event) => sendToRenderer('pi:event', event),
      agentDir: path.join(app.getPath('userData'), 'pi-agent'),
      llm: config.getLlmSettings()
    });
    registerIpc();
    createApplicationMenu();
    await addReposFromArgs();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    if (piService) piService.shutdown();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
