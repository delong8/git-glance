import type {
  AppSettings,
  GitBranchInfo,
  GitLfsReport,
  GitRemoteInfo,
  GitStashInfo,
  GitStatusFile,
  GitSubmoduleInfo,
  GitTagInfo,
  GitTreeNode,
  GitWorktree,
  Language,
  PiStatus,
  RepoSnapshot,
  RepoStatistics,
  RepoSummary,
  StashAction,
  SubmoduleStatus,
  ThemeMode
} from '../electron/shared/models';

export type { PreviewData, ThemeMode, Language } from '../electron/shared/models';

export type Tab = 'chat' | 'files' | 'worktrees' | 'remotes' | 'branches' | 'tags' | 'stashes' | 'lfs' | 'submodules' | 'statistics';
export type PaneMode = 'preview' | 'diff';
export type DetailScope = 'main' | 'chat';
export type BusyAction = 'refresh' | 'fetch' | 'pull' | 'push' | 'checkout' | 'stash' | 'submodule' | 'commit';

export interface RepoEntry extends GitTreeNode {
  change: GitStatusFile | null;
}

export interface RepoState extends RepoSnapshot {
  _version: number;
  _entries: RepoEntry[] | null;
  _entryMap: Map<string, RepoEntry> | null;
  _basenameMap: Map<string, string[]> | null;
}

export interface DetailState {
  token: number;
  cleanup: (() => void) | null;
  key: string | null;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  time: string;
  streaming?: boolean;
  aborted?: boolean;
  error?: string | null;
  tool?: string | null;
  _rendered?: string | null;
}

export interface ChatState {
  messages: ChatMessage[];
  streaming: boolean;
  stopping: boolean;
  streamText: string;
  draft: string;
  /** Position while browsing sent messages with ArrowUp/ArrowDown; null at the live draft. */
  historyIndex: number | null;
  error: string | null;
  tool: string | null;
}

export interface RepoFolderNode {
  type: 'folder';
  name: string;
  path: string;
  children: RepoTreeNode[];
  files: number;
  changed: number;
  staged: number;
}

export interface RepoFileNode {
  type: 'file' | 'link';
  name: string;
  path: string;
  entry: RepoEntry;
  change: GitStatusFile | null;
  target: string | null;
}

export type RepoTreeNode = RepoFolderNode | RepoFileNode;

export interface GraphRow {
  nodeLane: number;
  converging: number[];
  straight: number[];
  newLanes: number[];
  nodeContinues: boolean;
  fresh: boolean;
}

export interface AppState {
  repos: RepoSummary[];
  activeRepo: string | null;
  repo: RepoState | null;
  repoError: string | null;
  activeTab: Tab;
  worktrees: GitWorktree[];
  worktreesLoading: boolean;
  worktreesError: string | null;
  worktreesQuery: string;
  remotes: GitRemoteInfo[];
  remotesLoading: boolean;
  remotesError: string | null;
  remotesQuery: string;
  fetchingRemote: string | null;
  branches: GitBranchInfo[];
  branchesLoading: boolean;
  branchesError: string | null;
  branchesQuery: string;
  switchingBranch: string | null;
  tags: GitTagInfo[];
  tagsLoading: boolean;
  tagsError: string | null;
  tagsQuery: string;
  checkingOutTag: string | null;
  stashes: GitStashInfo[];
  stashesLoading: boolean;
  stashesError: string | null;
  stashesQuery: string;
  stashAction: { ref: string; action: StashAction } | null;
  lfsReport: GitLfsReport | null;
  lfsLoading: boolean;
  lfsError: string | null;
  lfsQuery: string;
  submodules: GitSubmoduleInfo[];
  submodulesLoading: boolean;
  submodulesError: string | null;
  submodulesQuery: string;
  updatingSubmodule: string | null;
  statistics: RepoStatistics | null;
  statisticsLoading: boolean;
  statisticsError: string | null;
  statisticsDownloading: boolean;
  paneMode: PaneMode;
  chatPaneMode: PaneMode;
  selectedFile: string | null;
  chatSelectedFile: string | null;
  chatTreeCollapsed: Set<string>;
  chatPreviewOpen: boolean;
  historyLoading: boolean;
  historyError: string | null;
  fileQuery: string;
  projectQuery: string;
  treeExpanded: Set<string>;
  settings: AppSettings;
  currentUser: { name: string; email: string };
  pi: PiStatus;
  home: string;
  platform: string;
  chats: Map<string, ChatState>;
  commitDrafts: Map<string, string>;
  detail: Record<DetailScope, DetailState>;
  loadingRepo: boolean;
  loadToken: number;
  loadSeq: number;
  busyAction: BusyAction | null;
  staging: boolean;
  committing: boolean;
  savingSettings: boolean;
  autoFetchTimer: number | null;
  chatRenderQueued: boolean;
  lastFocusRefresh: number;
  themeMode: ThemeMode;
  language: Language;
  sidebarHidden: boolean;
  branchModalOpen: boolean;
  branchModalQuery: string;
  branchModalBase: string | null;
  creatingBranch: boolean;
  appVersion: string;
  buildTag: string;
}
