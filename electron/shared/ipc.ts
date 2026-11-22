import type {
  AppSettings,
  Bootstrap,
  CommitResult,
  FileDiff,
  PiAbortResult,
  PiEvent,
  PiResetResult,
  PiSendResult,
  PiStatus,
  PreviewData,
  PullStrategy,
  RepoSnapshot,
  RepoSummary,
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
  openExternal: (url: string) => Promise<true>;
  saveSettings: (settings: SettingsInput) => Promise<SaveSettingsResult>;
  setTheme: (theme: ThemeMode) => Promise<ThemeMode>;
  setLanguage: (language: Language) => Promise<Language>;
  pi: {
    send: (repoPath: string, message: string, selectedFile: string | null) => Promise<PiSendResult>;
    abort: (repoPath: string) => Promise<PiAbortResult>;
    reset: (repoPath: string) => Promise<PiResetResult>;
    onEvent: (callback: (event: PiEvent) => void) => () => void;
  };
  onMenu: (callback: (action: MenuAction) => void) => () => void;
}
