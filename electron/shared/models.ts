/**
 * Browser-safe domain contracts shared by the Electron services and renderer.
 * Do not import Node-specific types here: this file is also compiled as part
 * of the renderer TypeScript project.
 */

export type GitStatusCode = 'M' | 'A' | 'D' | 'R' | 'U';

export interface GitRemote {
  name: string;
  url: string;
  fetchUrl: string;
  pushUrl: string;
}

/** A configured remote plus its default and remote-tracking branches. */
export interface GitRemoteInfo extends GitRemote {
  /** Remote-tracking branch names with the remote prefix removed. */
  branches: string[];
  /** Branch pointed to by the remote's HEAD, when it is known. */
  defaultBranch: string | null;
}

/** A local or remote-tracking branch with its latest commit and tracking state. */
export interface GitBranchInfo {
  /** Short local name, or the remote-tracking name such as `origin/main`. */
  name: string;
  remote: boolean;
  current: boolean;
  head: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  /** True when the configured upstream no longer exists. */
  gone: boolean;
  author: string;
  when: string;
  timestamp: number;
  subject: string;
}

export interface GitCheckoutResult {
  /** Local branch that was checked out. */
  branch: string;
  output: string;
}

/** A tag with the object it points to and, for annotated tags, its annotation. */
export interface GitTagInfo {
  name: string;
  /** Commit (or other object) the tag resolves to. */
  head: string;
  targetType: string;
  annotated: boolean;
  /** True when the tag points at the current HEAD commit. */
  atHead: boolean;
  subject: string;
  author: string;
  commitWhen: string;
  annotation: string | null;
  tagger: string | null;
  /** Tagger date for annotated tags, otherwise the commit date. */
  when: string;
  timestamp: number;
}

export interface GitTagCheckoutResult {
  tag: string;
  head: string;
  output: string;
}

export type StashAction = 'apply' | 'pop' | 'drop';

/** How `git reset` moves the current branch. */
export type ResetMode = 'soft' | 'mixed' | 'hard';

/** A stash entry with its base commit and changed-file stats. */
export interface GitStashInfo {
  index: number;
  ref: string;
  sha: string;
  branch: string | null;
  /** Reflog subject such as `WIP on main: abc1234 Fix login`. */
  message: string;
  base: string | null;
  baseSubject: string;
  when: string;
  timestamp: number;
  files: number;
  add: number;
  del: number;
  binary: boolean;
}

/** An LFS-tracked file as seen in the working tree. */
export interface GitLfsFile {
  path: string;
  /** LFS object size when known, otherwise the working-tree size. */
  size: number;
  oid: string | null;
  /** True when the working-tree file is still an LFS pointer. */
  pointer: boolean;
  missing: boolean;
}

/** A non-LFS file above the large-file threshold. */
export interface GitLargeFile {
  path: string;
  size: number;
  tracked: boolean;
  mtimeMs: number | null;
}

export interface GitLfsReport {
  lfs: GitLfsFile[];
  large: GitLargeFile[];
  threshold: number;
  /** True when the `git lfs` command is available. */
  lfsAvailable: boolean;
}

export type SubmoduleStatus = 'current' | 'modified' | 'uninitialized' | 'conflicted';

/** A submodule entry from `.gitmodules` plus its checked-out state. */
export interface GitSubmoduleInfo {
  path: string;
  url: string;
  branch: string | null;
  indexSha: string;
  headSha: string | null;
  currentBranch: string | null;
  status: SubmoduleStatus;
  dirty: boolean;
  subject: string;
  author: string;
  when: string;
  describe: string | null;
}

export interface RepoLanguageStat {
  ext: string;
  files: number;
  bytes: number;
}

export interface RepoContributorStat {
  name: string;
  email: string;
  commits: number;
}

export interface RepoActivityBucket {
  label: string;
  count: number;
}

export interface RepoStatistics {
  generatedAt: string;
  repo: {
    name: string;
    path: string;
    branch: string;
    detached: boolean;
    head: string | null;
    upstream: string | null;
    ahead: number;
    behind: number;
    lastFetch: string | null;
    remotes: number;
    worktrees: number;
    submodules: number;
    stashes: number;
    localBranches: number;
    remoteBranches: number;
    tags: number;
  };
  commits: {
    total: number;
    contributors: number;
    firstWhen: string | null;
    lastWhen: string | null;
    lastSubject: string;
    lastAuthor: string;
    activity: RepoActivityBucket[];
  };
  contributors: RepoContributorStat[];
  workingTree: {
    changes: number;
    staged: number;
    unstaged: number;
    add: number;
    del: number;
  };
  files: {
    tracked: number;
    bytes: number;
    languages: RepoLanguageStat[];
  };
  objectStoreBytes: number;
}

export interface DownloadReportResult {
  canceled: boolean;
  path?: string;
}

export interface BranchInfo {
  branch: string;
  detached: boolean;
  headSha: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  remotes: GitRemote[];
  lastFetch: string | null;
}

export interface DiffStat {
  add: number;
  del: number;
  binary: boolean;
}

export interface GitStatusFile {
  path: string;
  origPath: string | null;
  status: GitStatusCode;
  staged: boolean;
  untracked: boolean;
  indexStatus: string;
  worktreeStatus: string;
  add: number;
  del: number;
  binary: boolean;
}

export interface GitTreeNode {
  path: string;
  kind: 'file' | 'link';
  target: string | null;
}

export interface GitCommit {
  sha: string;
  parents: string[];
  author: string;
  email: string;
  when: string;
  timestamp: number;
  refs: string[];
  message: string;
  stats: [number, number];
  merge: boolean;
}

/** A linked worktree as reported by `git worktree list --porcelain`. */
export interface GitWorktree {
  path: string;
  name: string;
  head: string | null;
  branch: string | null;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  lockReason: string | null;
  prunable: boolean;
  pruneReason: string | null;
  /** The first entry in the list owns the repository's main working tree. */
  isMain: boolean;
  /** True for the worktree GitGlance currently has open. */
  isCurrent: boolean;
}

export interface RepoSummary {
  path: string;
  name: string;
  branch: string;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  lastFetch: string | null;
  remotes: GitRemote[];
  changedCount: number;
  stagedCount: number;
  unstagedCount: number;
  files: GitStatusFile[];
  error?: string | null;
}

export interface RepoSnapshot {
  path: string;
  name: string;
  branch: string;
  detached: boolean;
  headSha: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  lastFetch: string | null;
  remotes: GitRemote[];
  files: GitStatusFile[];
  tree: GitTreeNode[];
  treeTotal: number;
  treeTruncated: boolean;
  history: GitCommit[];
  historyTotal: number;
}

export interface FileDiff {
  diff: string;
  binary: boolean;
  empty: boolean;
}

export interface CommitResult {
  output: string;
  sha: string | null;
}

export type PullStrategy = 'merge' | 'rebase' | 'ff-only';
export type AutoFetchInterval = 'off' | '5' | '15' | '30' | '60';
export type ThemeMode = 'light' | 'dark' | 'system';
export type Language = 'en' | 'zh-CN';
/** Persisted language preference: a concrete language or the system locale. */
export type LanguageMode = Language | 'system';

/** Wire protocols the Pi agent can speak to a custom endpoint. */
export type LlmApiType =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'google-vertex';

/**
 * LLM endpoint used by the Pi chat agent. GitGlance writes this into its own
 * Pi agent directory, so the user's ~/.pi configuration is never read.
 */
export interface LlmSettings {
  provider: string;
  api: LlmApiType;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const MAX_SYSTEM_PROMPT_LENGTH = 8000;
export const MAX_CUSTOM_PROMPT_LENGTH = 2000;
export const MAX_CUSTOM_PROMPTS = 8;

export interface UiSettings {
  autoFetch: AutoFetchInterval;
  fetchAll: boolean;
  theme: ThemeMode;
  language: LanguageMode;
  /** Interface zoom factor (0.5–3.0). Null uses the default of 1.0. */
  zoom: number | null;
  /** Extra system instructions appended to GitGlance's built-in Pi prompt. */
  systemPrompt: string;
  /** User-authored prompts shown above the chat composer. */
  customPrompts: string[];
}

export interface GitGlobalConfig {
  name: string;
  email: string;
  defaultBranch: string;
  editor: string;
  pullStrategy: PullStrategy;
  sign: boolean;
  gpgKey: string;
  prune: boolean;
  raw: Record<string, string>;
}

export interface AppSettings extends GitGlobalConfig, UiSettings {
  llm: LlmSettings;
}

export interface SettingsInput {
  name: string;
  email: string;
  defaultBranch: string;
  editor: string;
  pullStrategy: PullStrategy;
  autoFetch: AutoFetchInterval;
  sign: boolean;
  gpgKey: string;
  prune: boolean;
  fetchAll: boolean;
  theme: ThemeMode;
  language: LanguageMode;
  systemPrompt: string;
  customPrompts: string[];
  llm: LlmSettings;
}

export interface UserIdentity {
  name: string;
  email: string;
}

export type PreviewBytes =
  | Uint8Array
  | ArrayBuffer
  | number[]
  | { type: 'Buffer'; data: number[] }
  | { data: PreviewBytes };

export interface PreviewCommon {
  path: string;
  name: string;
  extension: string;
  size: number;
  mtimeMs: number | null;
  deleted: boolean;
}

export type OfficeType = 'word' | 'excel' | 'powerpoint';

export interface LinkPreview {
  kind: 'link';
  path: string;
  target: string | null;
}

export interface ImagePreview extends PreviewCommon {
  kind: 'image';
  mimeType: string;
  bytes: PreviewBytes;
}

export interface PdfPreview extends PreviewCommon {
  kind: 'pdf';
  mimeType: string;
  bytes: PreviewBytes;
  convertedFrom?: string;
  officeType?: OfficeType;
  engine?: string;
  cached?: boolean;
}

export interface TextPreview extends PreviewCommon {
  kind: 'text';
  encoding: string;
  language: string;
  content: string;
  lineCount: number;
  truncated: boolean;
  previewBytes: number;
}

export interface BinaryPreview extends PreviewCommon {
  kind: 'binary';
}

export type PreviewData =
  | LinkPreview
  | ImagePreview
  | PdfPreview
  | TextPreview
  | BinaryPreview;

export interface PiStatus {
  available: boolean;
  binary: string | null;
  configured: boolean;
  provider: string | null;
  model: string | null;
  error: string | null;
}

interface PiEventBase {
  repoPath: string;
}

export type PiEvent =
  | (PiEventBase & { type: 'start' })
  | (PiEventBase & { type: 'delta'; delta: string })
  | (PiEventBase & { type: 'tool'; toolName: string; args?: unknown })
  | (PiEventBase & { type: 'tool_done'; toolName: string; isError: boolean })
  | (PiEventBase & { type: 'status'; message: string })
  | (PiEventBase & { type: 'done'; aborted: boolean; text?: string; durationMs?: number })
  | (PiEventBase & { type: 'error'; message: string });

export interface PiSendResult {
  accepted: true;
  id: string;
}

export interface PiAbortResult {
  aborted: boolean;
}

export interface PiResetResult {
  reset: boolean;
}

export interface Bootstrap {
  repos: RepoSummary[];
  activeRepo: string | null;
  settings: AppSettings;
  currentUser: UserIdentity;
  pi: PiStatus;
  platform: string;
  home: string;
  appVersion: string;
  /** Release tag from the build, e.g. 261125.86148e0; empty when unavailable. */
  buildTag: string;
  configPath: string;
}
