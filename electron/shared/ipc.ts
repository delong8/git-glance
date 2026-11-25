import type {
  AppSettings,
  Bootstrap,
  CommitResult,
  DownloadReportResult,
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
  RepoStatistics,
  StashAction,
  PiAbortResult,
  PiEvent,
  PiResetResult,
  PiSendResult,
  PiStatus,
  PreviewData,
  PullStrategy,
  RepoSnapshot,
  RepoSummary,
  ResetMode,
  SettingsInput,
  ThemeMode,
  Language,
  UserIdentity
} from './models.js';

export type IpcEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type MenuAction =
  | 'settings'
  | 'open-repository'
  | 'remove-repository'
  | 'refresh';

export type OpenRepositoryResult =
  | { canceled: true }
  | { canceled: false; path: string; bootstrap: Bootstrap };

export interface OpenWorktreeResult {
  path: string;
  bootstrap: Bootstrap;
}

export interface OpenSubmoduleResult {
  path: string;
  bootstrap: Bootstrap;
}

export interface FetchOptions {
  all?: boolean;
  prune?: boolean;
}

export interface RepoSummariesResult {
  repos: RepoSummary[];
  activeRepo: string | null;
}

export interface SaveSettingsResult {
  settings: AppSettings;
  currentUser: UserIdentity;
  pi: PiStatus;
}

export interface GitGlanceApi {
  platform: string;
  bootstrap: () => Promise<Bootstrap>;
  openRepository: () => Promise<OpenRepositoryResult>;
  selectRepository: (repoPath: string) => Promise<{ path: string }>;
  removeRepository: (repoPath: string) => Promise<{ bootstrap: Bootstrap }>;
  getSnapshot: (repoPath: string) => Promise<RepoSnapshot>;
  getHistoryPage: (repoPath: string, skip: number) => Promise<GitCommit[]>;
  getWorktrees: (repoPath: string) => Promise<GitWorktree[]>;
  openWorktree: (repoPath: string, worktreePath: string) => Promise<OpenWorktreeResult>;
  revealWorktree: (repoPath: string, worktreePath: string) => Promise<true>;
  getRemotes: (repoPath: string) => Promise<GitRemoteInfo[]>;
  fetchRemote: (repoPath: string, remoteName: string, prune?: boolean) => Promise<string>;
  getBranches: (repoPath: string) => Promise<GitBranchInfo[]>;
  checkoutBranch: (repoPath: string, branchName: string) => Promise<GitCheckoutResult>;
  createBranch: (repoPath: string, branchName: string, startPoint: string) => Promise<GitCheckoutResult>;
  createBranchAt: (repoPath: string, branchName: string, commitSha: string) => Promise<string>;
  createTagAt: (repoPath: string, tagName: string, commitSha: string) => Promise<string>;
  cherryPickCommit: (repoPath: string, commitSha: string) => Promise<string>;
  revertCommit: (repoPath: string, commitSha: string) => Promise<string>;
  resetToCommit: (repoPath: string, commitSha: string, mode: ResetMode) => Promise<string>;
  squashCommit: (repoPath: string, commitSha: string) => Promise<string>;
  stashChanges: (repoPath: string) => Promise<string>;
  getTags: (repoPath: string) => Promise<GitTagInfo[]>;
  checkoutTag: (repoPath: string, tagName: string) => Promise<GitTagCheckoutResult>;
  getStashes: (repoPath: string) => Promise<GitStashInfo[]>;
  runStashAction: (repoPath: string, ref: string, action: StashAction) => Promise<string>;
  getLfsReport: (repoPath: string) => Promise<GitLfsReport>;
  getSubmodules: (repoPath: string) => Promise<GitSubmoduleInfo[]>;
  updateSubmodule: (repoPath: string, submodulePath: string) => Promise<string>;
  openSubmodule: (repoPath: string, submodulePath: string) => Promise<OpenSubmoduleResult>;
  getStatistics: (repoPath: string) => Promise<RepoStatistics>;
  downloadStatistics: (repoPath: string, html: string) => Promise<DownloadReportResult>;
  getSummaries: () => Promise<RepoSummariesResult>;
  stage: (repoPath: string, filePath: string) => Promise<true>;
  unstage: (repoPath: string, filePath: string) => Promise<true>;
  stageAll: (repoPath: string) => Promise<true>;
  unstageAll: (repoPath: string) => Promise<true>;
  commit: (repoPath: string, message: string) => Promise<CommitResult>;
  fetch: (repoPath: string, options?: FetchOptions) => Promise<string>;
  pull: (repoPath: string, strategy?: PullStrategy) => Promise<string>;
  push: (repoPath: string) => Promise<string>;
  readDiff: (repoPath: string, filePath: string, staged: boolean) => Promise<FileDiff>;
  readPreview: (repoPath: string, filePath: string) => Promise<PreviewData>;
  openPath: (repoPath: string, filePath: string) => Promise<true>;
  revealPath: (repoPath: string, filePath: string) => Promise<true>;
  openRepoFolder: (repoPath: string) => Promise<true>;
  openRepoTerminal: (repoPath: string) => Promise<true>;
  openExternal: (url: string) => Promise<true>;
  saveSettings: (settings: SettingsInput) => Promise<SaveSettingsResult>;
  setTheme: (theme: ThemeMode) => Promise<ThemeMode>;
  setLanguage: (language: Language) => Promise<Language>;
  setZoom: (zoom: number | null) => Promise<number | null>;
  pi: {
    send: (repoPath: string, message: string, selectedFile: string | null) => Promise<PiSendResult>;
    abort: (repoPath: string) => Promise<PiAbortResult>;
    reset: (repoPath: string) => Promise<PiResetResult>;
    onEvent: (callback: (event: PiEvent) => void) => () => void;
  };
  onMenu: (callback: (action: MenuAction) => void) => () => void;
}
