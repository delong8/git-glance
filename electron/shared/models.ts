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

export interface UiSettings {
  autoFetch: AutoFetchInterval;
  fetchAll: boolean;
  theme: ThemeMode;
  language: Language;
  /** Interface zoom factor (0.5–5.0). Null uses the default of 1.0. */
  zoom: number | null;
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
  language: Language;
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
  configPath: string;
}
