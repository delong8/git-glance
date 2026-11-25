import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type {
  Bootstrap,
  CommitResult,
  DownloadReportResult,
  PiAbortResult,
  PiEvent,
  PiResetResult,
  PiSendResult,
  PreviewData,
  PullStrategy,
  RepoSnapshot,
  RepoStatistics,
  ResetMode,
  FileDiff,
  GitBranchInfo,
  GitCheckoutResult,
  GitCommit,
  GitLfsReport,
  GitRemoteInfo,
  GitStashInfo,
  GitSubmoduleInfo,
  GitTagCheckoutResult,
  GitTagInfo,
  GitWorktree,
  SettingsInput,
  StashAction,
  ThemeMode,
  Language
} from './shared/models.js';
import type {
  FetchOptions,
  GitGlanceApi,
  IpcEnvelope,
  MenuAction,
  OpenRepositoryResult,
  OpenSubmoduleResult,
  OpenWorktreeResult,
  RepoSummariesResult,
  SaveSettingsResult
} from './shared/ipc.js';

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = await ipcRenderer.invoke(channel, ...args) as IpcEnvelope<T> | null;
  if (!result || result.ok !== true) {
    throw new Error((result && result.error) || 'GitGlance request failed');
  }
  return result.data;
}

const api: GitGlanceApi = {
  platform: process.platform,
  bootstrap: () => call<Bootstrap>('app:bootstrap'),
  openRepository: () => call<OpenRepositoryResult>('repo:open'),
  selectRepository: (repoPath) => call<{ path: string }>('repo:select', repoPath),
  removeRepository: (repoPath) => call<{ bootstrap: Bootstrap }>('repo:remove', repoPath),
  getSnapshot: (repoPath) => call<RepoSnapshot>('repo:snapshot', repoPath),
  getHistoryPage: (repoPath, skip) => call<GitCommit[]>('repo:history', repoPath, skip),
  getWorktrees: (repoPath) => call<GitWorktree[]>('repo:worktrees', repoPath),
  openWorktree: (repoPath, worktreePath) => call<OpenWorktreeResult>('worktree:open', repoPath, worktreePath),
  revealWorktree: (repoPath, worktreePath) => call<true>('worktree:reveal', repoPath, worktreePath),
  getRemotes: (repoPath) => call<GitRemoteInfo[]>('repo:remotes', repoPath),
  fetchRemote: (repoPath, remoteName, prune) => call<string>('git:fetch-remote', repoPath, remoteName, prune),
  getBranches: (repoPath) => call<GitBranchInfo[]>('repo:branches', repoPath),
  checkoutBranch: (repoPath, branchName) => call<GitCheckoutResult>('git:checkout-branch', repoPath, branchName),
  createBranch: (repoPath, branchName, startPoint) => call<GitCheckoutResult>('git:create-branch', repoPath, branchName, startPoint),
  createBranchAt: (repoPath, branchName, commitSha) => call<string>('git:create-branch-at', repoPath, branchName, commitSha),
  createTagAt: (repoPath, tagName, commitSha) => call<string>('git:create-tag-at', repoPath, tagName, commitSha),
  cherryPickCommit: (repoPath, commitSha) => call<string>('git:cherry-pick', repoPath, commitSha),
  revertCommit: (repoPath, commitSha) => call<string>('git:revert-commit', repoPath, commitSha),
  resetToCommit: (repoPath, commitSha, mode: ResetMode) => call<string>('git:reset-to', repoPath, commitSha, mode),
  squashCommit: (repoPath, commitSha) => call<string>('git:squash-commit', repoPath, commitSha),
  stashChanges: (repoPath) => call<string>('git:stash-changes', repoPath),
  getTags: (repoPath) => call<GitTagInfo[]>('repo:tags', repoPath),
  checkoutTag: (repoPath, tagName) => call<GitTagCheckoutResult>('git:checkout-tag', repoPath, tagName),
  getStashes: (repoPath) => call<GitStashInfo[]>('repo:stashes', repoPath),
  runStashAction: (repoPath, ref, action: StashAction) => call<string>('git:stash-action', repoPath, ref, action),
  getLfsReport: (repoPath) => call<GitLfsReport>('repo:lfs', repoPath),
  getSubmodules: (repoPath) => call<GitSubmoduleInfo[]>('repo:submodules', repoPath),
  updateSubmodule: (repoPath, submodulePath) => call<string>('git:submodule-update', repoPath, submodulePath),
  openSubmodule: (repoPath, submodulePath) => call<OpenSubmoduleResult>('submodule:open', repoPath, submodulePath),
  getStatistics: (repoPath) => call<RepoStatistics>('repo:statistics', repoPath),
  downloadStatistics: (repoPath, html) => call<DownloadReportResult>('stats:download', repoPath, html),
  getSummaries: () => call<RepoSummariesResult>('repo:summaries'),
  stage: (repoPath, filePath) => call<true>('git:stage', repoPath, filePath),
  unstage: (repoPath, filePath) => call<true>('git:unstage', repoPath, filePath),
  stageAll: (repoPath) => call<true>('git:stage-all', repoPath),
  unstageAll: (repoPath) => call<true>('git:unstage-all', repoPath),
  commit: (repoPath, message) => call<CommitResult>('git:commit', repoPath, message),
  fetch: (repoPath, options?: FetchOptions) => call<string>('git:fetch', repoPath, options),
  pull: (repoPath, strategy?: PullStrategy) => call<string>('git:pull', repoPath, strategy),
  push: (repoPath) => call<string>('git:push', repoPath),
  readDiff: (repoPath, filePath, staged) => call<FileDiff>('git:diff', repoPath, filePath, staged),
  readPreview: (repoPath, filePath) => call<PreviewData>('preview:file', repoPath, filePath),
  openPath: (repoPath, filePath) => call<true>('preview:open', repoPath, filePath),
  revealPath: (repoPath, filePath) => call<true>('preview:reveal', repoPath, filePath),
  openRepoFolder: (repoPath) => call<true>('app:open-repo-folder', repoPath),
  openRepoTerminal: (repoPath) => call<true>('app:open-repo-terminal', repoPath),
  openExternal: (url) => call<true>('app:open-external', url),
  saveSettings: (settings: SettingsInput) => call<SaveSettingsResult>('settings:save', settings),
  setTheme: (theme: ThemeMode) => call<ThemeMode>('settings:theme', theme),
  setLanguage: (language: Language) => call<Language>('settings:language', language),
  setZoom: (zoom) => call<number | null>('settings:zoom', zoom),
  pi: {
    send: (repoPath, message, selectedFile) => call<PiSendResult>('pi:send', repoPath, message, selectedFile),
    abort: (repoPath) => call<PiAbortResult>('pi:abort', repoPath),
    reset: (repoPath) => call<PiResetResult>('pi:reset', repoPath),
    onEvent: (callback: (event: PiEvent) => void) => {
      const listener = (_event: IpcRendererEvent, payload: PiEvent): void => callback(payload);
      ipcRenderer.on('pi:event', listener);
      return () => ipcRenderer.removeListener('pi:event', listener);
    }
  },
  onMenu: (callback: (action: MenuAction) => void) => {
    const listener = (_event: IpcRendererEvent, action: MenuAction): void => callback(action);
    ipcRenderer.on('app:menu', listener);
    return () => ipcRenderer.removeListener('app:menu', listener);
  }
};

contextBridge.exposeInMainWorld('gitglance', api);
