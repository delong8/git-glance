import './app.css';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import { mountPreview } from './preview';
import {
  cachedLanguageMode,
  isChinese,
  LANGUAGE_STORAGE_KEY,
  normalizeLanguageMode,
  resolveLanguage,
  setI18nLanguage,
  startI18nObserver,
  translateUI
} from './i18n';
import type { GitGlanceApi, MenuAction } from '../electron/shared/ipc';
import { MAX_CUSTOM_PROMPTS, MAX_CUSTOM_PROMPT_TITLE_LENGTH } from '../electron/shared/models';
import type {
  AppSettings,
  AutoFetchInterval,
  Bootstrap,
  CustomPrompt,
  GitBranchInfo,
  GitCommit,
  GitLargeFile,
  GitLfsFile,
  GitLfsReport,
  GitRemoteInfo,
  GitStashInfo,
  GitStatusFile,
  GitSubmoduleInfo,
  GitTagInfo,
  GitWorktree,
  LanguageMode,
  LlmApiType,
  LlmSettings,
  PiEvent,
  PreviewData,
  PullStrategy,
  RepoSnapshot,
  RepoStatistics,
  RepoSummary,
  ResetMode,
  SettingsInput,
  StashAction,
  SubmoduleStatus,
  ThemeMode
} from '../electron/shared/models';
import type {
  AppState,
  BusyAction,
  ChatMessage,
  ChatState,
  DetailScope,
  GraphRow,
  PaneMode,
  RepoEntry,
  RepoFileNode,
  RepoFolderNode,
  RepoState,
  RepoTreeNode,
  Tab
} from './types';

const api = window.gitglance as GitGlanceApi;

function $<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

function $$<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element as T;
}

function eventTarget(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}

function normalizePullStrategy(value: unknown): PullStrategy {
  return value === 'rebase' || value === 'ff-only' ? value : 'merge';
}

const LLM_API_TYPES: readonly LlmApiType[] = [
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'google-generative-ai',
  'google-vertex'
];

function normalizeLlmApiType(value: unknown): LlmApiType {
  return LLM_API_TYPES.includes(value as LlmApiType) ? value as LlmApiType : 'openai-completions';
}

function normalizeLlmSettings(value: LlmSettings | undefined): LlmSettings {
  return {
    provider: value?.provider || '',
    api: normalizeLlmApiType(value?.api),
    baseUrl: value?.baseUrl || '',
    apiKey: value?.apiKey || '',
    model: value?.model || ''
  };
}

function normalizeAutoFetch(value: unknown): AutoFetchInterval {
  return value === 'off' || value === '5' || value === '15' || value === '30' || value === '60' ? value : '15';
}

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
};

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] || char);
const icon = (name: string, cls = ''): string => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

marked.setOptions({ gfm: true, breaks: true });

/* ============================================================
   Constants & formatting
   ============================================================ */
const AVATAR_GRADIENTS = [
  ['#5b8def', '#8b5cf6'],
  ['#0ea5e9', '#14b8a6'],
  ['#ec4899', '#a855f7'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#84cc16'],
  ['#6366f1', '#ec4899'],
  ['#f97316', '#eab308'],
  ['#06b6d4', '#6366f1']
];
const LANE_COLORS = ['#7c9cff', '#f5b955', '#b79bff', '#4ade80'];
const laneColor = (lane: number): string => LANE_COLORS[lane % LANE_COLORS.length];

const NON_DIFF_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'tif', 'tiff', 'svg',
  'pdf', 'doc', 'docx', 'dot', 'dotx', 'odt', 'rtf', 'xls', 'xlsx', 'xlsm', 'ods',
  'ppt', 'pptx', 'pps', 'ppsx', 'odp',
  'zip', 'gz', 'tgz', 'bz2', '7z', 'rar', 'jar', 'war', 'tar',
  'mp3', 'mp4', 'mov', 'avi', 'mkv', 'wav', 'flac', 'webm', 'ogg',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'exe', 'dylib', 'so', 'dll', 'bin', 'class', 'o', 'a', 'wasm', 'sqlite', 'db'
]);

const OFFICE_EXTENSIONS = new Set([
  'doc', 'docx', 'dot', 'dotx', 'odt', 'rtf',
  'xls', 'xlsx', 'xlsm', 'ods',
  'ppt', 'pptx', 'pps', 'ppsx', 'odp'
]);

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg']);

const LANGUAGE_BY_EXT: Record<string, { name: string; color: string }> = {
  ts: { name: 'TypeScript', color: '#3178c6' },
  tsx: { name: 'TypeScript', color: '#3178c6' },
  js: { name: 'JavaScript', color: '#f1e05a' },
  jsx: { name: 'JavaScript', color: '#f1e05a' },
  mjs: { name: 'JavaScript', color: '#f1e05a' },
  cjs: { name: 'JavaScript', color: '#f1e05a' },
  go: { name: 'Go', color: '#00add8' },
  py: { name: 'Python', color: '#3572A5' },
  rs: { name: 'Rust', color: '#dea584' },
  java: { name: 'Java', color: '#b07219' },
  kt: { name: 'Kotlin', color: '#A97BFF' },
  swift: { name: 'Swift', color: '#F05138' },
  rb: { name: 'Ruby', color: '#701516' },
  php: { name: 'PHP', color: '#4F5D95' },
  c: { name: 'C', color: '#8b949e' },
  h: { name: 'C', color: '#8b949e' },
  cpp: { name: 'C++', color: '#f34b7d' },
  cc: { name: 'C++', color: '#f34b7d' },
  hpp: { name: 'C++', color: '#f34b7d' },
  cs: { name: 'C#', color: '#178600' },
  css: { name: 'CSS', color: '#563d7c' },
  scss: { name: 'SCSS', color: '#c6538c' },
  html: { name: 'HTML', color: '#e34c26' },
  sh: { name: 'Shell', color: '#89e051' },
  zsh: { name: 'Shell', color: '#89e051' },
  md: { name: 'Markdown', color: '#519aba' },
  mdx: { name: 'MDX', color: '#519aba' },
  json: { name: 'JSON', color: '#8b9ab0' },
  yml: { name: 'YAML', color: '#cb171e' },
  yaml: { name: 'YAML', color: '#cb171e' },
  toml: { name: 'TOML', color: '#9c4221' },
  lua: { name: 'Lua', color: '#000080' }
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return 'never';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

const nowTime = (): string => new Date().toLocaleTimeString(isChinese() ? 'zh-CN' : [], { hour: 'numeric', minute: '2-digit' });

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function pluralBranch(count: number): string {
  return `${count} ${count === 1 ? 'branch' : 'branches'}`;
}

function gradientFor(seed: string): string[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function initials(name: string | null | undefined): string {
  return String(name || 'Developer').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
}

function avatarHTML(name: string | null | undefined, cls = ''): string {
  const [a, b] = gradientFor(name || 'Developer');
  return `<span class="avatar ${cls}" style="--a1:${a};--a2:${b}">${esc(initials(name))}</span>`;
}

function setAvatar(element: HTMLElement | null, name?: string): void {
  if (!element) return;
  const [a, b] = gradientFor(name || 'Developer');
  element.style.setProperty('--a1', a);
  element.style.setProperty('--a2', b);
  element.textContent = initials(name);
}

function projectShort(name: string | null | undefined): string {
  const parts = String(name || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s._-]+/)
    .filter(Boolean);
  const value = parts.slice(0, 2).map((part) => part[0]).join('');
  return (value || String(name || '?').slice(0, 2)).toUpperCase();
}

function statusName(status: string): string {
  const labels: Record<string, string> = {
    M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', U: 'Conflicted'
  };
  return labels[status] || 'Changed';
}

function extensionOf(filePath: string | null | undefined): string {
  const base = String(filePath || '').split('/').pop() || '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1) : '';
}

function isTextExtension(filePath: string): boolean {
  const ext = extensionOf(filePath);
  if (!ext) return true;
  return !NON_DIFF_EXTENSIONS.has(ext);
}

function fileLanguageLabel(filePath: string): string {
  const ext = extensionOf(filePath);
  if (ext === 'gitconfig') return 'Git config';
  if (ext === 'toml') return 'TOML';
  if (!ext) return 'Text';
  return ext.toUpperCase();
}

function displayPath(repoPath: string | null | undefined): string {
  if (!repoPath) return '';
  if (state.home && repoPath.startsWith(state.home)) return `~${repoPath.slice(state.home.length)}`;
  return repoPath;
}

/* ============================================================
   State
   ============================================================ */
const state: AppState = {
  repos: [],
  activeRepo: null,
  repo: null,
  repoError: null,
  activeTab: 'chat',
  worktrees: [],
  worktreesLoading: false,
  worktreesError: null,
  worktreesQuery: '',
  remotes: [],
  remotesLoading: false,
  remotesError: null,
  remotesQuery: '',
  fetchingRemote: null,
  branches: [],
  branchesLoading: false,
  branchesError: null,
  branchesQuery: '',
  switchingBranch: null,
  tags: [],
  tagsLoading: false,
  tagsError: null,
  tagsQuery: '',
  checkingOutTag: null,
  stashes: [],
  stashesLoading: false,
  stashesError: null,
  stashesQuery: '',
  stashAction: null,
  lfsReport: null,
  lfsLoading: false,
  lfsError: null,
  lfsQuery: '',
  submodules: [],
  submodulesLoading: false,
  submodulesError: null,
  submodulesQuery: '',
  updatingSubmodule: null,
  statistics: null,
  statisticsLoading: false,
  statisticsError: null,
  statisticsDownloading: false,
  paneMode: 'preview',
  chatPaneMode: 'preview',
  selectedFile: null,
  chatSelectedFile: null,
  chatTreeCollapsed: new Set<string>(),
  chatPreviewOpen: false,
  historyLoading: false,
  historyError: null,
  fileQuery: '',
  projectQuery: '',
  treeExpanded: new Set<string>(),
  settings: {
    name: '',
    email: '',
    defaultBranch: 'main',
    editor: 'nvim',
    pullStrategy: 'merge',
    autoFetch: '15',
    sign: false,
    gpgKey: '',
    prune: true,
    fetchAll: false,
    theme: 'dark',
    language: 'en',
    zoom: null,
    systemPrompt: '',
    customPrompts: [],
    llm: {
      provider: '',
      api: 'openai-completions',
      baseUrl: '',
      apiKey: '',
      model: ''
    },
    raw: {}
  },
  currentUser: { name: 'Developer', email: '' },
  pi: { available: false, binary: null, configured: false, provider: null, model: null, error: null },
  home: '',
  platform: '',
  chats: new Map<string, ChatState>(),
  commitDrafts: new Map<string, string>(),
  detail: {
    main: { token: 0, cleanup: null, key: null },
    chat: { token: 0, cleanup: null, key: null }
  },
  loadingRepo: false,
  loadToken: 0,
  loadSeq: 0,
  busyAction: null,
  staging: false,
  committing: false,
  savingSettings: false,
  autoFetchTimer: null,
  chatRenderQueued: false,
  lastFocusRefresh: 0,
  themeMode: 'dark',
  language: 'en',
  sidebarHidden: false,
  branchModalOpen: false,
  branchModalQuery: '',
  branchModalBase: null,
  creatingBranch: false,
  appVersion: '',
  buildTag: ''
};

/* ============================================================
   Appearance
   ============================================================ */
const THEME_STORAGE_KEY = 'gitglance.theme';
const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];
const systemLightQuery = window.matchMedia('(prefers-color-scheme: light)');

function normalizeThemeMode(mode: unknown): ThemeMode {
  return THEME_MODES.includes(mode as ThemeMode) ? mode as ThemeMode : 'dark';
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return systemLightQuery.matches ? 'light' : 'dark';
  return mode;
}

function cachedThemeMode(): ThemeMode {
  try {
    return normalizeThemeMode(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'dark';
  }
}

function applyTheme(mode: unknown, { remember = true }: { remember?: boolean } = {}): void {
  const next = normalizeThemeMode(mode);
  const resolved = resolveTheme(next);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themeMode = next;
  root.style.colorScheme = resolved;
  state.themeMode = next;
  if (remember) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* localStorage can be unavailable; the config file remains the source of truth */
    }
  }
  const hint = $('#setThemeHint');
  if (next === 'system' && hint) {
    hint.textContent = themeHintText(next);
  }
}

function themeHintText(mode: ThemeMode): string {
  const resolved = resolveTheme(mode);
  if (isChinese()) {
    return mode === 'system'
      ? `正在跟随系统 — 当前为${resolved === 'light' ? '浅色' : '深色'}。`
      : '立即生效并保存到应用偏好。';
  }
  return mode === 'system'
    ? `Following the system — currently ${resolved}.`
    : 'Applied immediately and saved to app preferences.';
}

applyTheme(cachedThemeMode(), { remember: false });
systemLightQuery.addEventListener('change', () => {
  if (state.themeMode === 'system') applyTheme('system', { remember: false });
});

function updateThemeControls(mode: ThemeMode): void {
  $$('#themeMode button').forEach((button) => {
    const active = button.dataset.value === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const hint = $('#setThemeHint');
  if (hint) {
    hint.textContent = themeHintText(mode);
  }
}

/* ============================================================
   Interface language
   ============================================================ */
function languageHintText(mode: LanguageMode): string {
  const resolved = resolveLanguage(mode);
  if (isChinese()) {
    return mode === 'system'
      ? `正在跟随系统 — 当前为${resolved === 'zh-CN' ? '简体中文' : '英文'}。`
      : '立即应用到整个应用。';
  }
  return mode === 'system'
    ? `Following the system — currently ${resolved === 'zh-CN' ? 'Simplified Chinese' : 'English'}.`
    : 'Applied immediately and saved to app preferences.';
}

function updateLanguageControls(value: unknown): void {
  const mode = normalizeLanguageMode(value);
  $$('#languageMode button').forEach((button) => {
    const active = button.dataset.value === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const hint = $('#setLanguageHint');
  if (hint) hint.textContent = languageHintText(mode);
}

function applyLanguage(value: unknown, { remember = true }: { remember?: boolean } = {}): void {
  const mode = normalizeLanguageMode(value);
  const next = resolveLanguage(mode);
  state.language = next;
  state.settings = { ...state.settings, language: mode };
  setI18nLanguage(next);
  if (remember) {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, mode);
    } catch {
      /* localStorage can be unavailable; the config file remains the source of truth */
    }
  }
  updateThemeControls(state.settings.theme || state.themeMode);
  updateLanguageControls(mode);
  renderStatistics();
}

applyLanguage(cachedLanguageMode(), { remember: false });
window.addEventListener('languagechange', () => {
  if (normalizeLanguageMode(state.settings.language) !== 'system') return;
  applyLanguage('system', { remember: false });
});
startI18nObserver();

let languageRequestSeq = 0;

async function chooseLanguage(value: unknown): Promise<void> {
  const mode = normalizeLanguageMode(value);
  const previous = normalizeLanguageMode(state.settings.language || state.language);
  if (mode === previous) {
    updateLanguageControls(mode);
    return;
  }
  applyLanguage(mode, { remember: false });
  updateLanguageControls(mode);
  if (!api) return;
  const requestId = ++languageRequestSeq;
  try {
    const saved = await api.setLanguage(mode);
    if (requestId !== languageRequestSeq) return;
    applyLanguage(saved);
  } catch (error) {
    if (requestId !== languageRequestSeq) return;
    applyLanguage(previous);
    toast(error instanceof Error ? error.message : String(error), 'warn');
  }
}

let themeRequestSeq = 0;

async function chooseTheme(value: unknown): Promise<void> {
  const next = normalizeThemeMode(value);
  const previous = normalizeThemeMode(state.settings.theme || state.themeMode);
  if (next === previous) {
    updateThemeControls(next);
    return;
  }
  state.settings = { ...state.settings, theme: next };
  applyTheme(next, { remember: false });
  updateThemeControls(next);
  if (!api) return;
  const requestId = ++themeRequestSeq;
  try {
    const saved = await api.setTheme(next);
    if (requestId !== themeRequestSeq) return;
    state.settings = { ...state.settings, theme: saved };
    applyTheme(saved);
  } catch (error) {
    if (requestId !== themeRequestSeq) return;
    state.settings = { ...state.settings, theme: previous };
    applyTheme(previous);
    updateThemeControls(previous);
    toast(error instanceof Error ? error.message : String(error), 'warn');
  }
}

/* ============================================================
   Interface zoom
   ============================================================ */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
let zoomRequestSeq = 0;

function normalizeZoom(value: unknown): number | null {
  const factor = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(factor)) return null;
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, factor));
  return Math.round(clamped * 10) / 10;
}

function zoomPercent(zoom: number | null): string {
  return `${Math.round((zoom ?? 1) * 100)}%`;
}

function updateZoomControls(zoom: number | null): void {
  const factor = zoom ?? 1;
  const input = $<HTMLInputElement>('#setZoom');
  if (input) {
    input.value = String(factor);
    input.style.setProperty('--range-progress', `${((factor - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100}%`);
  }
  const label = $('#setZoomValue');
  if (label) label.textContent = zoomPercent(factor);
}

async function chooseZoom(value: unknown): Promise<void> {
  const next = normalizeZoom(value);
  const previous = state.settings.zoom ?? null;
  if (next === previous) {
    updateZoomControls(next);
    return;
  }
  state.settings = { ...state.settings, zoom: next };
  updateZoomControls(next);
  if (!api) return;
  const requestId = ++zoomRequestSeq;
  try {
    const saved = await api.setZoom(next);
    if (requestId !== zoomRequestSeq) return;
    state.settings = { ...state.settings, zoom: saved };
    updateZoomControls(saved);
  } catch (error) {
    if (requestId !== zoomRequestSeq) return;
    state.settings = { ...state.settings, zoom: previous };
    updateZoomControls(previous);
    toast(error instanceof Error ? error.message : String(error), 'warn');
  }
}

let messageSeq = 0;
marked.setOptions({ gfm: true, breaks: true });

/* ============================================================
   Repo state helpers
   ============================================================ */
function getRepoSummary(repoPath: string): RepoSummary | null {
  return state.repos.find((repo) => repo.path === repoPath) || null;
}

function currentRepoPath(): string | null {
  return state.repo?.path || state.activeRepo || null;
}

function prepareRepo(snapshot: RepoSnapshot): RepoState {
  const repo = snapshot as RepoState;
  repo._version = ++state.loadSeq;
  repo._entries = null;
  repo._entryMap = null;
  repo._basenameMap = null;
  return repo;
}

function repoEntries(repo: RepoState | null = state.repo): RepoEntry[] {
  if (!repo) return [];
  if (repo._entries) return repo._entries;
  const changes = new Map<string, GitStatusFile>((repo.files || []).map((file) => [file.path, file]));
  const entries: RepoEntry[] = (repo.tree || []).map((entry) => ({
    path: entry.path,
    kind: entry.kind || 'file',
    target: entry.target || null,
    change: changes.get(entry.path) || null
  }));
  const known = new Set(entries.map((entry) => entry.path));
  for (const file of repo.files || []) {
    if (!known.has(file.path)) {
      entries.push({ path: file.path, kind: 'file', target: null, change: file });
    }
  }
  repo._entries = entries;
  const entryMap = new Map(entries.map((entry) => [entry.path, entry]));
  const basenameMap = new Map<string, string[]>();
  repo._entryMap = entryMap;
  repo._basenameMap = basenameMap;
  for (const entry of entries) {
    if (entry.kind !== 'file') continue;
    const base = entry.path.split('/').pop() || entry.path;
    const paths = basenameMap.get(base);
    if (paths) paths.push(entry.path);
    else basenameMap.set(base, [entry.path]);
  }
  return entries;
}

function entryForPath(filePath: string): RepoEntry | null {
  if (!state.repo) return null;
  repoEntries(state.repo);
  return state.repo._entryMap?.get(filePath) || null;
}

function changeForPath(filePath: string): GitStatusFile | null {
  return state.repo?.files.find((file) => file.path === filePath) || null;
}

function pickTreeFile(repo: RepoState): string | null {
  const entries = repoEntries(repo);
  if (!entries.length) return null;
  const roots = entries.filter((entry) => !entry.path.includes('/'));
  const changedRoot = roots.find((entry) => entry.kind === 'file' && entry.change);
  const readme = roots.find((entry) => entry.kind === 'file' && /^readme(\.md|\.txt)?$/i.test(entry.path));
  const anyRootFile = roots.find((entry) => entry.kind === 'file');
  const anyFile = entries.find((entry) => entry.kind === 'file');
  return (changedRoot || readme || anyRootFile || anyFile || entries[0])?.path || null;
}

function firstChangedTreeFile(nodes: RepoTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.type === 'folder') {
      const found = firstChangedTreeFile(node.children);
      if (found) return found;
    } else if (node.change) {
      return node.path;
    }
  }
  return null;
}

function pickChatFile(repo: RepoState | null): string | null {
  if (!repo) return null;
  return firstChangedTreeFile(buildRepoTree(repoEntries(repo).filter((entry) => entry.change), false));
}

function ancestorsOf(filePath: string | null): string[] {
  if (!filePath) return [];
  const parts = filePath.split('/');
  const result: string[] = [];
  for (let i = 1; i < parts.length; i += 1) result.push(parts.slice(0, i).join('/'));
  return result;
}

function expandTreeAncestors(filePath: string | null): void {
  for (const folder of ancestorsOf(filePath)) state.treeExpanded.add(folder);
}

function mergeSummaryFromSnapshot(snapshot: RepoSnapshot): void {
  const existing = getRepoSummary(snapshot.path);
  if (!existing) return;
  Object.assign(existing, {
    name: snapshot.name,
    branch: snapshot.branch,
    upstream: snapshot.upstream,
    ahead: snapshot.ahead,
    behind: snapshot.behind,
    lastFetch: snapshot.lastFetch,
    remotes: snapshot.remotes,
    changedCount: snapshot.files.length,
    stagedCount: snapshot.files.filter((file) => file.staged).length,
    unstagedCount: snapshot.files.filter((file) => !file.staged).length,
    error: null
  });
}

/* ============================================================
   Chat state
   ============================================================ */
function getChat(repoPath: string): ChatState {
  let chat = state.chats.get(repoPath);
  if (!chat) {
    chat = {
      messages: [],
      streaming: false,
      stopping: false,
      streamText: '',
      draft: '',
      historyIndex: null,
      error: null,
      tool: null
    };
    state.chats.set(repoPath, chat);
  }
  return chat;
}

function currentChat(): ChatState | null {
  return state.repo ? getChat(state.repo.path) : null;
}

function createUserMessage(text: string): ChatMessage {
  return { id: ++messageSeq, role: 'user', text, time: nowTime() };
}

function createAssistantMessage(): ChatMessage {
  return {
    id: ++messageSeq,
    role: 'assistant',
    text: '',
    streaming: true,
    aborted: false,
    error: null,
    tool: null,
    time: nowTime()
  };
}

/* ============================================================
   Boot
   ============================================================ */
function setBootStatus(text: string): void {
  const el = $('#bootStatus');
  if (el) el.innerHTML = text;
}

function hideSplash(): void {
  const splash = $('#bootSplash');
  if (splash) splash.classList.add('is-hidden');
}

function showBrowserFallback(): void {
  const splash = $('#bootSplash');
  if (!splash) return;
  setBootStatus('This interface is an Electron desktop app.<br>Run <code>npm start</code> (or <code>npm run dev</code>) to launch it locally.');
  const spinner = splash.querySelector('.boot-spinner');
  if (spinner) spinner.remove();
  const title = splash.querySelector('.boot-title');
  if (title) title.textContent = 'GitGlance for desktop';
}

function showBootError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  setBootStatus(`Could not start GitGlance.<br><span style="color:var(--red-text-soft)">${esc(message)}</span>`);
  const spinner = $('#bootSplash .boot-spinner');
  if (spinner) spinner.remove();
  const status = $('#bootStatus');
  if (status && !$('#bootRetry')) {
    const retry = document.createElement('button');
    retry.id = 'bootRetry';
    retry.className = 'preview-tool-btn';
    retry.style.marginTop = '8px';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => window.location.reload());
    status.appendChild(retry);
  }
}

async function boot(): Promise<void> {
  if (!window.gitglance) {
    document.body.classList.remove('is-electron');
    showBrowserFallback();
    return;
  }

  document.body.classList.add('is-electron');
  document.body.classList.add(`platform-${api.platform}`);
  state.platform = api.platform;

  bindStaticEvents();
  api.pi.onEvent(handlePiEvent);
  api.onMenu(handleMenu);

  try {
    const bootstrap = await api.bootstrap();
    applyBootstrap(bootstrap);
    if (!state.repos.length) {
      showOnboarding();
      hideSplash();
      return;
    }
    const target = bootstrap.activeRepo || state.repos[0]?.path;
    await loadRepo(target, { initial: true });
  } catch (error) {
    showBootError(error);
  }
}

function applyBootstrap(bootstrap: Bootstrap): void {
  state.home = bootstrap.home || state.home;
  state.repos = bootstrap.repos || [];
  state.activeRepo = bootstrap.activeRepo || state.repos[0]?.path || null;
  state.settings = bootstrap.settings || state.settings;
  state.currentUser = bootstrap.currentUser || state.currentUser;
  state.pi = bootstrap.pi || state.pi;
  state.appVersion = bootstrap.appVersion;
  state.buildTag = bootstrap.buildTag || '';
  applyTheme(state.settings.theme || 'dark');
  applyLanguage(state.settings.language || 'en');
  const versionBadge = $('#appVersionBadge');
  const buildTag = state.buildTag;
  if (versionBadge) {
    if (buildTag) {
      const [date, sha] = buildTag.split('.');
      versionBadge.innerHTML = `<span class="tag-date">${esc(date)}.</span><span class="tag-sha">${esc(sha || '')}</span>`;
      versionBadge.title = buildTag;
    } else if (state.appVersion) {
      versionBadge.textContent = `v${state.appVersion}`;
      versionBadge.removeAttribute('title');
    }
  }
  const aboutVersion = $('#aboutVersion');
  if (aboutVersion) aboutVersion.textContent = buildTag || (state.appVersion ? `v${state.appVersion}` : '');
  const aboutVersionFact = $('#aboutVersionFact');
  if (aboutVersionFact) aboutVersionFact.textContent = buildTag || state.appVersion;
  updateUserUI();
  renderProjectList();
  renderSidebarMeta();
  scheduleAutoFetch();
}

async function loadRepo(repoPath: string | null | undefined, { initial = false }: { initial?: boolean } = {}): Promise<void> {
  if (state.branchModalOpen) closeBranchModal();
  if (!repoPath) {
    showOnboarding();
    return;
  }
  const token = ++state.loadToken;
  state.activeRepo = repoPath;
  state.loadingRepo = true;
  renderProjectList();
  renderTitlebar();
  if (!initial) showRepoLoading();

  void api.selectRepository(repoPath).catch(() => {});

  try {
    const snapshot = await api.getSnapshot(repoPath);
    if (token !== state.loadToken) return;
    disposeDetail('main');
    disposeDetail('chat');
    const diffPane = $('#diffPane');
    const chatDetail = $('#chatDetail');
    if (diffPane) diffPane.innerHTML = '';
    if (chatDetail) chatDetail.innerHTML = '';

    state.repo = prepareRepo(snapshot);
    resetChatHistoryPaging();
    state.repoError = null;
    document.body.classList.remove('no-repo');
    mergeSummaryFromSnapshot(snapshot);

    state.selectedFile = pickTreeFile(state.repo);
    state.paneMode = 'preview';
    state.treeExpanded = new Set<string>();
    state.chatTreeCollapsed = new Set<string>();
    state.chatPreviewOpen = false;
    expandTreeAncestors(state.selectedFile);
    state.chatSelectedFile = pickChatFile(state.repo);
    state.chatPaneMode = 'preview';
    state.fileQuery = '';
    state.worktrees = [];
    state.worktreesError = null;
    state.worktreesQuery = '';
    state.worktreesLoading = true;
    state.remotes = [];
    state.remotesError = null;
    state.remotesQuery = '';
    state.remotesLoading = true;
    state.fetchingRemote = null;
    state.branches = [];
    state.branchesError = null;
    state.branchesQuery = '';
    state.branchesLoading = true;
    state.switchingBranch = null;
    state.tags = [];
    state.tagsError = null;
    state.tagsQuery = '';
    state.tagsLoading = true;
    state.checkingOutTag = null;
    state.stashes = [];
    state.stashesError = null;
    state.stashesQuery = '';
    state.stashesLoading = true;
    state.stashAction = null;
    state.lfsReport = null;
    state.lfsError = null;
    state.lfsQuery = '';
    state.lfsLoading = true;
    state.submodules = [];
    state.submodulesError = null;
    state.submodulesQuery = '';
    state.submodulesLoading = true;
    state.updatingSubmodule = null;
    state.statistics = null;
    state.statisticsError = null;
    state.statisticsLoading = false;
    state.statisticsDownloading = false;

    state.loadingRepo = false;
    syncCommitInput(true);
    renderAll();
    syncChatInput(true);
    void loadWorktrees(state.repo.path);
    void loadRemotes(state.repo.path);
    void loadBranches(state.repo.path);
    void loadTags(state.repo.path);
    void loadStashes(state.repo.path);
    void loadLfsReport(state.repo.path);
    void loadSubmodules(state.repo.path);
    if (state.activeTab === 'statistics') void loadStatistics(state.repo.path);

    if (state.activeTab === 'chat' && state.chatSelectedFile && state.chatPreviewOpen) renderDetail('chat');
    hideRepoLoading();
    hideSplash();
  } catch (error) {
    if (token !== state.loadToken) return;
    const message = error instanceof Error ? error.message : String(error);
    state.loadingRepo = false;
    state.repo = null;
    state.repoError = message;
    const summary = getRepoSummary(repoPath);
    if (summary) summary.error = message;
    showOnboarding(error);
    hideRepoLoading();
    hideSplash();
  }
}

function showRepoLoading(): void {
  let overlay = $('#repoLoadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'repoLoadingOverlay';
    overlay.className = 'repo-loading-overlay';
    overlay.innerHTML = '<span class="spinner"></span><span>Loading repository…</span>';
    $('.main')?.appendChild(overlay);
  }
  overlay.hidden = false;
}

function hideRepoLoading(): void {
  const overlay = $('#repoLoadingOverlay');
  if (overlay) overlay.hidden = true;
  state.loadingRepo = false;
}

function showOnboarding(error: unknown = null): void {
  document.body.classList.add('no-repo');
  state.repo = null;
  state.worktrees = [];
  state.worktreesLoading = false;
  state.worktreesError = null;
  state.remotes = [];
  state.remotesLoading = false;
  state.remotesError = null;
  state.fetchingRemote = null;
  state.branches = [];
  state.branchesLoading = false;
  state.branchesError = null;
  state.switchingBranch = null;
  state.tags = [];
  state.tagsLoading = false;
  state.tagsError = null;
  state.checkingOutTag = null;
  state.stashes = [];
  state.stashesLoading = false;
  state.stashesError = null;
  state.stashAction = null;
  state.lfsReport = null;
  state.lfsLoading = false;
  state.lfsError = null;
  state.submodules = [];
  state.submodulesLoading = false;
  state.submodulesError = null;
  state.updatingSubmodule = null;
  state.statistics = null;
  state.statisticsLoading = false;
  state.statisticsError = null;
  state.statisticsDownloading = false;
  disposeDetail('main');
  disposeDetail('chat');
  const summaryRoot = $('#summaryRoot');
  const isError = !!error;
  const path = state.activeRepo;
  const repoSummary = path ? getRepoSummary(path) : null;

  if (summaryRoot) {
    summaryRoot.innerHTML = `<div class="onboarding-card">
      <div class="onboarding-mark">${icon(isError ? 'alert' : 'folder')}</div>
      <h2>${isError ? 'This repository could not be opened' : 'Open your first repository'}</h2>
      <p>${isError
        ? 'GitGlance could read the workspace list, but this worktree is no longer available or the Git command failed.'
        : 'GitGlance is a local desktop client. Point it at a folder inside a Git repository to inspect changes, stage files, browse history, and chat with Pi about your work.'}
      </p>
      ${isError ? `<div class="onboarding-error"><strong>${esc(repoSummary?.name || path || 'Repository')}</strong><br>${esc(errorText(error))}</div>` : ''}
      <div class="onboarding-actions">
        <button class="btn primary" data-action="open-repo">${icon('folder')}Open repository</button>
        ${isError ? `<button class="btn ghost" data-action="retry-repo">${icon('refresh')}Try again</button>` : ''}
        <button class="btn ghost" data-action="open-settings">${icon('gear')}Settings</button>
      </div>
      <div class="onboarding-steps">
        <div class="onboarding-step"><span class="num">01</span><span class="t">Pick a worktree</span><span class="d">Choose any folder inside a local Git repository.</span></div>
        <div class="onboarding-step"><span class="num">02</span><span class="t">Review work</span><span class="d">Stage, commit, compare, and preview every file.</span></div>
        <div class="onboarding-step"><span class="num">03</span><span class="t">Ask Pi</span><span class="d">Chat with the Pi agent using your real repository context.</span></div>
      </div>
      ${state.pi?.available ? '' : `<div class="onboarding-error">Pi agent: ${esc(state.pi?.error || 'not available')}</div>`}
    </div>`;
  }
  renderProjectList();
  renderSidebarMeta();
  renderTitlebar();
}

/* ============================================================
   Project sidebar
   ============================================================ */
function renderProjectList() {
  const list = $('#projectList');
  if (!list) return;
  const query = state.projectQuery.trim().toLowerCase();
  const repos = state.repos.filter((repo) => {
    if (!query) return true;
    return `${repo.name} ${displayPath(repo.path)} ${repo.branch || ''}`.toLowerCase().includes(query);
  });
  const count = $('#projectCount');
  if (count) count.textContent = String(state.repos.length);

  if (!state.repos.length) {
    list.innerHTML = `<div class="project-empty">
      <span class="pe-icon">${icon('folder')}</span>
      <h4>No repositories</h4>
      <p>Open a local Git worktree to get started.</p>
      <button class="btn ghost sm" data-action="open-repo">${icon('plus')}Open repository</button>
    </div>`;
    return;
  }

  if (!repos.length) {
    list.innerHTML = `<div class="project-empty">
      <span class="pe-icon">${icon('search')}</span>
      <h4>No projects found</h4>
      <p>Nothing matches “${esc(state.projectQuery.trim())}”.</p>
    </div>`;
    return;
  }

  list.innerHTML = repos.map((repo) => {
    const active = repo.path === (state.repo?.path || state.activeRepo);
    const changes = repo.changedCount || repo.files?.length || 0;
    const ahead = repo.ahead || 0;
    const behind = repo.behind || 0;
    const [a, b] = gradientFor(repo.name);
    const counts = [];
    if (ahead) counts.push(`<span class="ab-a">↑${ahead}</span>`);
    if (behind) counts.push(`<span class="ab-b">↓${behind}</span>`);
    let status;
    if (repo.error) {
      status = `<span class="proj-clean" style="color:var(--red)" title="${esc(repo.error)}">${icon('alert')}</span>`;
    } else if (changes) {
      status = `<span class="proj-badge" title="${plural(changes, 'uncommitted file')}">${changes}</span>`;
    } else {
      status = `<span class="proj-clean" title="Working tree clean">${icon('check')}</span>`;
    }
    return `<button class="project${active ? ' is-active' : ''}" data-repo-path="${esc(repo.path)}" title="${esc(repo.path)}">
      <span class="proj-avatar" style="--a1:${a};--a2:${b}"><span>${esc(projectShort(repo.name))}</span></span>
      <span class="proj-main">
        <span class="proj-line1"><span class="proj-name">${esc(repo.name)}</span>${status}</span>
        <span class="proj-path">${esc(displayPath(repo.path))}</span>
        <span class="proj-meta">
          ${icon('branch')}
          <span class="proj-branch">${esc(repo.branch || 'no branch')}</span>
          ${counts.length ? `<span class="proj-ab-sep"></span><span class="proj-ab">${counts.join('')}</span>` : ''}
        </span>
      </span>
    </button>`;
  }).join('');
}

function renderTitlebar() {
  const context = $('#windowContext');
  const summary = state.repo || (state.activeRepo ? getRepoSummary(state.activeRepo) : null);
  if (context) {
    if (summary) {
      const shownPath = displayPath(summary.path);
      const separator = shownPath.startsWith('/') ? '' : '<span class="wc-slash">/</span>';
      context.innerHTML = `
        <span class="wc-name">${esc(summary.name)}</span>
        ${separator}
        <span class="wc-path"><span class="wc-path-text" title="${esc(summary.path)}">${esc(shownPath)}</span><button class="copy-btn" data-action="copy-path" title="Copy repository path" aria-label="Copy repository path">${icon('copy')}</button></span>`;
    } else {
      context.innerHTML = `<span class="wc-name">GitGlance</span><span class="wc-slash">/</span><span class="wc-path"><span class="wc-path-text">No repository</span></span>`;
    }
  }
  document.title = summary ? `${summary.name} — GitGlance` : 'GitGlance';
  updateUserUI();
}

function updateUserUI() {
  const chip = $('#userChip');
  if (chip) {
    chip.innerHTML = `<span class="user-name">${esc(state.currentUser.name || 'Developer')}</span>${avatarHTML(state.currentUser.name, 'avatar-chip')}`;
  }
  setAvatar($('#commitBarAvatar'), state.currentUser.name);
}

function renderSidebarMeta() {
  const el = $('#syncMeta');
  if (!el) return;
  const autoFetch = state.settings.autoFetch || 'off';
  const fetchLabel = autoFetch === 'off' ? 'auto-fetch off' : `auto-fetch every ${autoFetch} min`;
  const dotClass = autoFetch === 'off' ? ' is-off' : '';
  el.innerHTML = `<span class="status-dot${dotClass}"></span>${plural(state.repos.length, 'project')} · ${esc(fetchLabel)}`;
}

/* ============================================================
   Summary
   ============================================================ */
function renderSummary() {
  if (!state.repo) return;
  const repo = state.repo;
  const sync = [];
  if (repo.upstream) {
    if (repo.ahead) sync.push(`<span class="ahead">${icon('arrow-up')}${repo.ahead} ahead</span>`);
    if (repo.behind) sync.push(`<span class="behind">${icon('arrow-down')}${repo.behind} behind</span>`);
    if (!repo.ahead && !repo.behind) sync.push(`<span class="synced">${icon('check')}up to date</span>`);
  }
  const busy = state.busyAction;
  const canFetch = repo.remotes?.length > 0 && !busy;
  const canPull = !!repo.upstream && !busy;
  const canPush = !!repo.upstream && repo.ahead > 0 && !busy;
  const canStash = repo.files.length > 0 && !busy;

  const summaryRoot = $('#summaryRoot');
  if (!summaryRoot) return;
  summaryRoot.innerHTML = `
    <div class="summary-top">
      <div class="summary-id">
        <div class="title-row">
          <button class="btn ghost icon-only sidebar-toggle" id="sidebarToggle" data-action="toggle-sidebar" title="${state.sidebarHidden ? 'Show projects' : 'Hide projects'}" aria-label="${state.sidebarHidden ? 'Show projects' : 'Hide projects'}" aria-pressed="${state.sidebarHidden}" aria-controls="projectSidebar">${icon('panel-left')}</button>
          <h1>${esc(repo.name)}</h1>
          <span class="chip">${icon(repo.remotes?.length ? 'cloud' : 'laptop')}${repo.remotes?.length ? 'Remote' : 'Local'}</span>
          <span class="title-sep" aria-hidden="true"></span>
          <span class="branch-pill">${icon('branch')}${esc(repo.branch)}</span>
          <span class="sync-pair">${sync.join('')}</span>
          ${repo.upstream ? `<span class="remote">${icon('cloud')}${esc(repo.upstream)}</span>` : `<span class="remote">${icon('cloud')}no upstream</span>`}
          <span class="fetch-time">fetched ${esc(timeAgo(repo.lastFetch))}</span>
        </div>
      </div>

      <div class="summary-actions">
        <button class="btn ghost icon-only" data-action="refresh" title="Refresh repository" aria-label="Refresh repository"${busy ? ' disabled' : ''}>${icon('refresh', busy === 'refresh' ? 'spin' : '')}</button>
        <button class="btn ghost" data-action="fetch"${canFetch ? '' : ' disabled'} title="${repo.remotes?.length ? 'Fetch all remotes' : 'No remote configured'}">${icon('refresh', busy === 'fetch' ? 'spin' : '')}${busy === 'fetch' ? 'Fetching…' : 'Fetch'}</button>
        <button class="btn ghost" data-action="pull"${canPull ? '' : ' disabled'} title="${repo.upstream ? 'Pull from upstream' : 'No upstream configured'}">${busy === 'pull' ? `${icon('refresh', 'spin')}Pulling…` : `${icon('download')}Pull${repo.behind ? `<span class="count">${repo.behind}</span>` : ''}`}</button>
        <button class="btn ghost summary-compact" data-action="stash"${canStash ? '' : ' disabled'} title="${repo.files.length ? 'Stash current changes' : 'Working tree is clean'}">${icon('archive', busy === 'stash' ? 'spin' : '')}<span class="btn-label">Stash</span></button>
        <button class="btn ghost summary-compact" data-action="branches"${busy ? ' disabled' : ''} title="Switch or create branches">${icon('branch')}<span class="btn-label">Branch</span></button>
        <button class="btn primary" data-action="push"${canPush ? '' : ' disabled'} title="${repo.upstream ? 'Push to upstream' : 'No upstream configured'}">${busy === 'push' ? `${icon('refresh', 'spin')}Pushing…` : `${icon('upload')}Push${repo.ahead ? `<span class="count">${repo.ahead}</span>` : ''}`}</button>
        <div class="summary-group" role="group" aria-label="Project actions">
          <button class="btn ghost icon-only" data-action="open-folder" title="Open folder" aria-label="Open folder">${icon('folder')}</button>
          <button class="btn ghost icon-only" data-action="open-terminal" title="Open terminal" aria-label="Open terminal">${icon('terminal')}</button>
        </div>
      </div>
    </div>`;
}

/* ============================================================
   Tabs & commit bar
   ============================================================ */
function renderTabChrome() {
  $$('.tab').forEach((tab) => {
    const active = tab.dataset.tab === state.activeTab;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  $('#chatPanel')?.classList.toggle('is-active', state.activeTab === 'chat');
  $('#filesPanel')?.classList.toggle('is-active', state.activeTab === 'files');
  $('#worktreesPanel')?.classList.toggle('is-active', state.activeTab === 'worktrees');
  $('#remotesPanel')?.classList.toggle('is-active', state.activeTab === 'remotes');
  $('#branchesPanel')?.classList.toggle('is-active', state.activeTab === 'branches');
  $('#tagsPanel')?.classList.toggle('is-active', state.activeTab === 'tags');
  $('#stashesPanel')?.classList.toggle('is-active', state.activeTab === 'stashes');
  $('#lfsPanel')?.classList.toggle('is-active', state.activeTab === 'lfs');
  $('#submodulesPanel')?.classList.toggle('is-active', state.activeTab === 'submodules');
  $('#statisticsPanel')?.classList.toggle('is-active', state.activeTab === 'statistics');

  const hideTools = state.activeTab === 'chat' || state.activeTab === 'statistics';
  const tools = $('#tabsTools');
  if (tools) tools.hidden = hideTools;
  if (!hideTools) {
    const search = $<HTMLInputElement>('#tabSearch');
    if (search) {
      const filesActive = state.activeTab === 'files';
      const worktreesActive = state.activeTab === 'worktrees';
      const branchesActive = state.activeTab === 'branches';
      const tagsActive = state.activeTab === 'tags';
      const stashesActive = state.activeTab === 'stashes';
      const lfsActive = state.activeTab === 'lfs';
      const submodulesActive = state.activeTab === 'submodules';
      search.value = filesActive
        ? state.fileQuery
        : worktreesActive
          ? state.worktreesQuery
          : branchesActive
            ? state.branchesQuery
            : tagsActive
              ? state.tagsQuery
              : stashesActive
                ? state.stashesQuery
                : lfsActive
                  ? state.lfsQuery
                  : submodulesActive
                    ? state.submodulesQuery
                    : state.remotesQuery;
      search.placeholder = filesActive
        ? 'Filter files…'
        : worktreesActive
          ? 'Filter worktrees…'
          : branchesActive
            ? 'Filter branches…'
            : tagsActive
              ? 'Filter tags…'
              : stashesActive
                ? 'Filter stashes…'
                : lfsActive
                  ? 'Filter LFS and large files…'
                  : submodulesActive
                    ? 'Filter submodules…'
                    : 'Filter remotes…';
      search.setAttribute('aria-label', filesActive
        ? 'Filter files'
        : worktreesActive
          ? 'Filter worktrees'
          : branchesActive
            ? 'Filter branches'
            : tagsActive
              ? 'Filter tags'
              : stashesActive
                ? 'Filter stashes'
                : lfsActive
                  ? 'Filter LFS and large files'
                  : submodulesActive
                    ? 'Filter submodules'
                    : 'Filter remotes');
      syncSearchUI($('#tabSearchWrap'), search);
    }
  }
  updateFilesBadge();
  updateWorktreesBadge();
  updateRemotesBadge();
  updateBranchesBadge();
  updateTagsBadge();
  updateStashesBadge();
  updateLfsBadge();
  updateSubmodulesBadge();
  updateStatisticsBadge();
}

function updateStatisticsBadge(): void {
  const badge = $('#statisticsBadge');
  if (!badge) return;
  const count = state.statistics?.commits.total || 0;
  badge.textContent = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
  badge.hidden = count === 0;
}

function updateSubmodulesBadge(): void {
  const badge = $('#submodulesBadge');
  if (!badge) return;
  const count = state.submodules.length;
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function updateLfsBadge(): void {
  const badge = $('#lfsBadge');
  if (!badge) return;
  const count = state.lfsReport?.lfs.length || 0;
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function updateStashesBadge(): void {
  const badge = $('#stashesBadge');
  if (!badge) return;
  const count = state.stashes.length;
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function updateTagsBadge(): void {
  const badge = $('#tagsBadge');
  if (!badge) return;
  const count = state.tags.length;
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function updateBranchesBadge(): void {
  const badge = $('#branchesBadge');
  if (!badge) return;
  const count = state.branches.length;
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function updateRemotesBadge(): void {
  const badge = $('#remotesBadge');
  if (!badge) return;
  const count = state.remotes.length;
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function updateWorktreesBadge(): void {
  const badge = $('#worktreesBadge');
  if (!badge) return;
  const count = state.worktrees.length;
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function updateFilesBadge(): void {
  const badge = $('#filesBadge');
  if (!badge) return;
  const count = state.repo?.files.length || 0;
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function syncSearchUI(wrap: HTMLElement | null, input: HTMLInputElement | null): void {
  if (wrap && input) wrap.classList.toggle('has-query', !!input.value.trim());
}

function syncCommitInput(force = false): void {
  const input = $<HTMLInputElement>('#commitMessage');
  if (!input || !state.repo) return;
  const draft = state.commitDrafts.get(state.repo.path) || '';
  if (force || document.activeElement !== input) input.value = draft;
}

function updateCommitBar(): void {
  const bar = $('#commitBar');
  if (!bar) return;
  if (!state.repo || !state.repo.files.length) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const staged = state.repo.files.filter((file) => file.staged);
  const branch = $('#commitBranch');
  if (branch) branch.textContent = state.repo.branch;
  const btn = $<HTMLButtonElement>('#commitBtn');
  if (btn) btn.disabled = staged.length === 0 || state.committing;
  const label = $('#commitBtnLabel');
  if (label) {
    label.textContent = state.committing
      ? 'Committing…'
      : staged.length
        ? `Commit ${plural(staged.length, 'file')}`
        : 'Nothing staged';
  }
  setAvatar($('#commitBarAvatar'), state.currentUser.name);
  syncCommitInput();
}

/* ============================================================
   Full tree rendering
   ============================================================ */
type PendingFolder = Omit<RepoFolderNode, 'children'> & { children: Map<string, PendingFolder | RepoFileNode> };

function buildRepoTree(entries: RepoEntry[], queryActive: boolean): RepoTreeNode[] {
  const root: PendingFolder = {
    type: 'folder',
    name: '',
    path: '',
    children: new Map(),
    files: 0,
    changed: 0,
    staged: 0
  };
  for (const entry of entries) {
    const parts = entry.path.split('/');
    let node: PendingFolder = root;
    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      if (isLeaf) {
        node.children.set(part, {
          type: entry.kind || 'file',
          name: part,
          path: entry.path,
          entry,
          change: entry.change,
          target: entry.target
        });
        return;
      }
      let child = node.children.get(part);
      if (!child || child.type !== 'folder') {
        child = {
          type: 'folder',
          name: part,
          path: parts.slice(0, index + 1).join('/'),
          children: new Map(),
          files: 0,
          changed: 0,
          staged: 0
        };
        node.children.set(part, child);
      }
      node = child;
    });
  }

  const sortNodes = (nodeMap: Map<string, PendingFolder | RepoFileNode>): RepoTreeNode[] => {
    const list: RepoTreeNode[] = Array.from(nodeMap.values()).map((node) => node.type === 'folder'
      ? { ...node, children: sortNodes(node.children) }
      : node);
    list.sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (b.type === 'folder' && a.type !== 'folder') return 1;
      return a.name.localeCompare(b.name);
    });
    return list;
  };
  const roots = sortNodes(root.children);
  roots.forEach(decorateFolder);
  return roots;
}

function decorateFolder(node: RepoTreeNode): void {
  if (node.type !== 'folder') return;
  node.files = 0;
  node.changed = 0;
  node.staged = 0;
  node.children.forEach((child) => {
    decorateFolder(child);
    if (child.type === 'folder') {
      node.files += child.files;
      node.changed += child.changed;
      node.staged += child.staged;
    } else {
      node.files += 1;
      if (child.change) {
        node.changed += 1;
        if (child.change.staged) node.staged += 1;
      }
    }
  });
}

function renderRepoNodes(nodes: RepoTreeNode[], depth: number, queryActive: boolean): string {
  return nodes.map((node) => {
    if (node.type === 'folder') {
      const open = queryActive || state.treeExpanded.has(node.path);
      const badge = node.changed
        ? `<span class="folder-change${node.staged === node.changed ? ' all-staged' : ''}" title="${plural(node.changed, 'changed file')} · ${node.staged} staged"><i></i>${node.changed}</span>`
        : `<span class="folder-count">${node.files}</span>`;
      return `<div class="tree-row folder" data-repo-folder="${esc(node.path)}" style="--depth:${depth}" title="${esc(node.path)}">
        ${icon('chevron-right', `caret${open ? ' open' : ''}`)}
        ${icon('folder', 'folder-ico')}
        <span class="tree-label">${esc(node.name)}</span>
        ${badge}
      </div>` + (open ? renderRepoNodes(node.children, depth + 1, queryActive) : '');
    }

    const change = node.change || null;
    const selected = state.selectedFile === node.path;
    const [base, ext] = splitFileExt(node.name);
    const stage = change
      ? `<button class="stage-check${change.staged ? ' checked' : ''}" data-stage="${esc(node.path)}" aria-pressed="${change.staged}" aria-label="${change.staged ? 'Unstage' : 'Stage'} ${esc(node.path)}" title="${change.staged ? 'Unstage file' : 'Stage file'}">${icon('check')}</button>`
      : '<span class="stage-slot"></span>';
    let marker: string;
    if (node.type === 'link') marker = icon('link', 'link-ico');
    else if (change) marker = `<span class="status-badge status-${change.status}${change.staged ? ' is-staged' : ''}" title="${statusName(change.status)}${change.staged ? ' · staged' : ''}">${change.status}</span>`;
    else marker = icon('file', 'file-ico');
    const target = node.type === 'link'
      ? `<span class="link-target" title="${esc(node.target || '')}"><span class="arrow">→</span>${esc(node.target || '')}</span>`
      : '';
    const stats = change
      ? `<span class="file-diff">${change.binary
        ? '<span class="diff-del">binary</span>'
        : `${change.add ? `<span class="diff-add">+${change.add}</span>` : ''}${change.del ? `<span class="diff-del">−${change.del}</span>` : ''}`}</span>`
      : '';
    const rowClass = `tree-row file${selected ? ' is-selected' : ''}${!change ? ' is-clean' : ''}${node.type === 'link' ? ' is-link' : ''}`;
    const title = `${node.path} — click to preview${change ? ` · ${statusName(change.status)}${change.staged ? ' (staged)' : ''}` : ''}`;
    return `<div class="${rowClass}" data-file="${esc(node.path)}" data-kind="${node.type}" style="--depth:${depth}" title="${esc(title)}">
      ${stage}${marker}
      <span class="tree-label">${esc(base)}<span class="ext">${esc(ext)}</span></span>
      ${target}${stats}
    </div>`;
  }).join('');
}

function splitFileExt(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  if (dot > 0) return [name.slice(0, dot), name.slice(dot)];
  return [name, ''];
}

function renderFileTree() {
  if (!state.repo) return;
  const repo = state.repo;
  const entries = repoEntries(repo);
  const pane = $('#changesPane');
  if (!pane) return;
  const scrollTop = pane.scrollTop;

  if (!entries.length) state.selectedFile = null;
  if (state.selectedFile && !entries.some((entry) => entry.path === state.selectedFile)) {
    state.selectedFile = pickTreeFile(repo);
    state.paneMode = 'preview';
  }
  if (!state.selectedFile && entries.length) {
    state.selectedFile = pickTreeFile(repo);
    state.paneMode = 'preview';
    expandTreeAncestors(state.selectedFile);
  }

  const query = state.fileQuery.trim().toLowerCase();
  const matches = query ? entries.filter((entry) => entry.path.toLowerCase().includes(query)) : entries;
  if (query && matches.length && !matches.some((entry) => entry.path === state.selectedFile)) {
    state.selectedFile = (matches.find((entry) => entry.kind === 'file') || matches[0]).path;
    state.paneMode = 'preview';
    expandTreeAncestors(state.selectedFile);
  }

  const stats = {
    total: repo.files.length,
    staged: repo.files.filter((file) => file.staged).length
  };
  const fileCount = entries.filter((entry) => entry.kind === 'file').length;
  const linkCount = entries.filter((entry) => entry.kind === 'link').length;
  const actions = [
    stats.staged ? '<button class="group-action" data-stage-group="staged">Unstage all</button>' : '',
    stats.staged < stats.total ? '<button class="group-action" data-stage-group="unstaged">Stage all</button>' : ''
  ].join('');
  const entrySummary = `${plural(fileCount, 'file')}${linkCount ? ` · ${plural(linkCount, 'link')}` : ''} · ${stats.total} changed`;

  let html = `<div class="repo-tree-head">
    <div class="repo-tree-title"><span class="eyebrow">Repository</span><span class="repo-tree-sub">${entrySummary}</span></div>
    <div class="repo-tree-actions">${actions}</div>
  </div>`;

  if (!entries.length) {
    html += `<div class="empty-list">
      <span class="e-icon">${icon('folder')}</span>
      <h4>This repository is empty</h4>
      <p>Add files or make a first commit in your terminal, then refresh.</p>
      <button class="btn ghost sm" data-action="refresh">${icon('refresh')}Refresh</button>
    </div>`;
  } else if (!matches.length) {
    html += `<div class="empty-list">
      <span class="e-icon">${icon('search')}</span>
      <h4>No matching files</h4>
      <p>Nothing in the repository matches “${esc(state.fileQuery.trim())}”.</p>
      <button class="btn ghost sm" data-action="clear-files">Clear filter</button>
    </div>`;
  } else {
    html += renderRepoNodes(buildRepoTree(matches, !!query), 0, !!query);
  }

  pane.classList.remove('span-all');
  pane.innerHTML = html;
  pane.scrollTop = scrollTop;

  const commitBar = $('#commitBar');
  if (commitBar) commitBar.hidden = !repo.files.length;
  updateCommitBar();
  updateFilesBadge();

  if (state.activeTab === 'files') renderDetail('main');
}

/* ============================================================
   Commit graph (Chat history)
   ============================================================ */
function computeGraph(commits: GitCommit[]): GraphRow[] {
  const lanes: (string | null)[] = [];
  const rows: GraphRow[] = [];
  commits.forEach((commit) => {
    const before = lanes.slice();
    let nodeLane = before.indexOf(commit.sha);
    let fresh = false;
    if (nodeLane === -1) {
      nodeLane = before.findIndex((value) => value == null);
      if (nodeLane === -1) nodeLane = before.length;
      fresh = true;
    }
    const converging: number[] = [];
    for (let index = 0; index < before.length; index += 1) {
      if (index !== nodeLane && before[index] === commit.sha) converging.push(index);
    }
    lanes[nodeLane] = null;
    converging.forEach((index) => { lanes[index] = null; });

    const straight: number[] = [];
    for (let index = 0; index < before.length; index += 1) {
      if (index === nodeLane || converging.includes(index)) continue;
      if (before[index] != null) straight.push(index);
    }

    const parents = commit.parents || [];
    let nodeContinues = false;
    if (parents[0]) {
      lanes[nodeLane] = parents[0];
      nodeContinues = true;
    }
    const newLanes: number[] = [];
    for (let index = 1; index < parents.length; index += 1) {
      let lane = -1;
      for (let candidate = nodeLane + 1; candidate < lanes.length; candidate += 1) {
        if (lanes[candidate] == null) { lane = candidate; break; }
      }
      if (lane === -1) lane = lanes.length;
      lanes[lane] = parents[index];
      newLanes.push(lane);
    }
    rows.push({ nodeLane, converging, straight, newLanes, nodeContinues, fresh });
  });
  return rows;
}

function graphSVG(row: GraphRow, isHead: boolean, commit: GitCommit, simple = false): string {
  const H = 58;
  const midY = 29;
  const x = (lane: number): number => 16 + lane * 17;
  const color = laneColor(row.nodeLane);
  let content = '';
  if (simple) {
    content += `<path d="M16 0V${H}" stroke="var(--graph-line)" stroke-width="1.5" stroke-dasharray="2 4"/>`;
    if (isHead) content += `<circle cx="16" cy="${midY}" r="9" fill="${color}" opacity=".13"/>`;
    content += commit.merge
      ? `<circle cx="16" cy="${midY}" r="4.8" fill="var(--bg-main)" stroke="${color}" stroke-width="2.2"/>`
      : `<circle cx="16" cy="${midY}" r="4.4" fill="${color}" stroke="var(--bg-main)" stroke-width="1.5"/>`;
    return `<svg viewBox="0 0 64 58" aria-hidden="true">${content}</svg>`;
  }
  row.straight.forEach((lane) => {
    content += `<path d="M${x(lane)} 0V${H}" stroke="${laneColor(lane)}" stroke-opacity=".65" stroke-width="2"/>`;
  });
  row.converging.forEach((lane) => {
    content += `<path d="M${x(lane)} 0C${x(lane)} 15 ${x(row.nodeLane)} 14 ${x(row.nodeLane)} ${midY}" stroke="${laneColor(lane)}" stroke-opacity=".8" stroke-width="2" fill="none"/>`;
  });
  if (!row.fresh) content += `<path d="M${x(row.nodeLane)} 0V${midY}" stroke="${color}" stroke-width="2"/>`;
  if (row.nodeContinues) content += `<path d="M${x(row.nodeLane)} ${midY}V${H}" stroke="${color}" stroke-width="2"/>`;
  row.newLanes.forEach((lane) => {
    content += `<path d="M${x(row.nodeLane)} ${midY}C${x(row.nodeLane)} 43 ${x(lane)} 42 ${x(lane)} ${H}" stroke="${laneColor(lane)}" stroke-opacity=".85" stroke-width="2" fill="none"/>`;
  });
  if (isHead) content += `<circle cx="${x(row.nodeLane)}" cy="${midY}" r="9" fill="${color}" opacity=".13"/>`;
  content += commit.merge
    ? `<circle cx="${x(row.nodeLane)}" cy="${midY}" r="4.8" fill="var(--bg-main)" stroke="${color}" stroke-width="2.2"/>`
    : `<circle cx="${x(row.nodeLane)}" cy="${midY}" r="4.4" fill="${color}" stroke="var(--bg-main)" stroke-width="1.5"/>`;
  return `<svg viewBox="0 0 64 58" aria-hidden="true">${content}</svg>`;
}

function refPill(ref: string): string {
  const remote = state.remotes.some((entry) => ref.startsWith(`${entry.name}/`));
  const cls = /^v\d/i.test(ref) ? 'ref-tag' : remote ? 'ref-remote' : 'ref-branch';
  return `<span class="ref-pill ${cls}">${esc(ref)}</span>`;
}

/* ============================================================
   Worktrees
   ============================================================ */
let worktreesSeq = 0;

async function loadWorktrees(repoPath: string, { silent = false }: { silent?: boolean } = {}): Promise<void> {
  if (!repoPath) return;
  const requestId = ++worktreesSeq;
  state.worktreesLoading = true;
  if (!silent) renderWorktrees();
  try {
    const worktrees = await api.getWorktrees(repoPath);
    if (requestId !== worktreesSeq || state.repo?.path !== repoPath) return;
    state.worktrees = worktrees;
    state.worktreesError = null;
  } catch (error) {
    if (requestId !== worktreesSeq || state.repo?.path !== repoPath) return;
    state.worktrees = [];
    state.worktreesError = errorText(error);
  } finally {
    if (requestId === worktreesSeq) {
      state.worktreesLoading = false;
      renderWorktrees();
    }
  }
}

function worktreeRowHTML(worktree: GitWorktree): string {
  const flags: string[] = [];
  if (worktree.isCurrent) flags.push('<span class="wt-flag is-current">current</span>');
  if (worktree.isMain) flags.push('<span class="wt-flag">main worktree</span>');
  if (worktree.locked) flags.push(`<span class="wt-flag is-locked" title="${esc(worktree.lockReason || 'Locked worktree')}">locked</span>`);
  if (worktree.prunable) flags.push(`<span class="wt-flag is-prunable" title="${esc(worktree.pruneReason || 'Prunable worktree')}">prunable</span>`);
  if (worktree.bare) flags.push('<span class="wt-flag">bare</span>');
  const branch = worktree.branch
    ? `<span class="wt-branch" title="${esc(worktree.branch)}">${icon('branch')}${esc(worktree.branch)}</span>`
    : `<span class="wt-branch is-detached" title="Detached HEAD">${icon('git-commit')}detached</span>`;
  const shortHead = worktree.head ? worktree.head.slice(0, 7) : '—';
  return `<div class="worktree-row${worktree.isCurrent ? ' is-current' : ''}${worktree.prunable ? ' is-prunable' : ''}">
    <span class="wt-mark">${icon(worktree.isMain ? 'folder' : 'branch')}</span>
    <div class="wt-main">
      <div class="wt-name-line"><span class="wt-name">${esc(worktree.name)}</span>${flags.join('')}</div>
      <div class="wt-path" title="${esc(worktree.path)}">${esc(displayPath(worktree.path))}</div>
    </div>
    <div class="wt-meta">
      ${branch}
      ${worktree.head ? `<button class="wt-head" data-copy-sha="${esc(worktree.head)}" title="Copy commit SHA">${esc(shortHead)}</button>` : ''}
    </div>
    <div class="wt-actions">
      <button class="wt-action" data-worktree-open="${esc(worktree.path)}" title="${worktree.isCurrent ? 'Already open' : 'Open in GitGlance'}" aria-label="Open in GitGlance"${worktree.isCurrent || worktree.prunable || worktree.bare ? ' disabled' : ''}>${icon('chevron-right')}</button>
      <button class="wt-action" data-worktree-reveal="${esc(worktree.path)}" title="Reveal in Finder" aria-label="Reveal in Finder">${icon('folder')}</button>
      <button class="wt-action" data-worktree-copy="${esc(worktree.path)}" title="Copy worktree path" aria-label="Copy worktree path">${icon('copy')}</button>
    </div>
  </div>`;
}

function renderWorktrees(): void {
  const list = $('#worktreesList');
  const summary = $('#worktreesSummary');
  if (!list) return;
  const repo = state.repo;
  const worktrees = state.worktrees;
  const count = worktrees.length;

  if (summary) {
    if (!repo) summary.textContent = '';
    else if (state.worktreesLoading && !count) summary.textContent = 'Loading worktrees…';
    else if (state.worktreesError) summary.textContent = 'Worktrees could not be loaded';
    else summary.textContent = `${plural(count, 'worktree')} · ${displayPath(repo.path)}`;
  }

  updateWorktreesBadge();
  if (!repo) {
    list.innerHTML = '';
    return;
  }

  const refresh = $<HTMLButtonElement>('[data-action="refresh-worktrees"]');
  if (refresh) {
    refresh.disabled = state.worktreesLoading;
    refresh.querySelector('.ico')?.classList.toggle('spin', state.worktreesLoading);
  }

  if (state.worktreesLoading && !count) {
    list.innerHTML = '<div class="worktrees-loading"><span class="spinner"></span><span>Loading worktrees…</span></div>';
    return;
  }

  if (state.worktreesError) {
    list.innerHTML = `<div class="empty-list worktrees-empty">
      <span class="e-icon">${icon('alert')}</span>
      <h4>Worktrees unavailable</h4>
      <p>${esc(state.worktreesError)}</p>
      <button class="btn ghost sm" data-action="refresh-worktrees">${icon('refresh')}Try again</button>
    </div>`;
    return;
  }

  if (!count) {
    list.innerHTML = `<div class="empty-list worktrees-empty">
      <span class="e-icon">${icon('branch')}</span>
      <h4>No linked worktrees</h4>
      <p>This repository only has its main working tree. Add one with git worktree add, then refresh.</p>
      <button class="btn ghost sm" data-action="refresh-worktrees">${icon('refresh')}Refresh</button>
    </div>`;
    return;
  }

  const query = state.worktreesQuery.trim().toLowerCase();
  const items = worktrees.filter((worktree) => {
    if (!query) return true;
    return `${worktree.name} ${worktree.path} ${worktree.branch || ''} ${worktree.head || ''}`.toLowerCase().includes(query);
  });

  if (!items.length) {
    list.innerHTML = `<div class="empty-list worktrees-empty">
      <span class="e-icon">${icon('search')}</span>
      <h4>No matching worktrees</h4>
      <p>Nothing matches “${esc(state.worktreesQuery.trim())}”.</p>
      <button class="btn ghost sm" data-action="clear-worktrees">Clear filter</button>
    </div>`;
    return;
  }

  list.innerHTML = items.map(worktreeRowHTML).join('');
}

async function openWorktreePath(worktreePath: string): Promise<void> {
  if (!state.repo || !worktreePath) return;
  try {
    const result = await api.openWorktree(state.repo.path, worktreePath);
    applyBootstrap(result.bootstrap);
    await loadRepo(result.path);
    hideSplash();
    toast(`Opened ${getRepoSummary(result.path)?.name || worktreePath}`, 'success');
  } catch (error) {
    toast(errorText(error), 'warn');
  }
}

function revealWorktreePath(worktreePath: string): void {
  if (!state.repo || !worktreePath) return;
  void api.revealWorktree(state.repo.path, worktreePath).catch((error: unknown) => toast(errorText(error), 'warn'));
}

/* ============================================================
   Remotes
   ============================================================ */
let remotesSeq = 0;

async function loadRemotes(repoPath: string, { silent = false }: { silent?: boolean } = {}): Promise<void> {
  if (!repoPath) return;
  const requestId = ++remotesSeq;
  state.remotesLoading = true;
  if (!silent) renderRemotes();
  try {
    const remotes = await api.getRemotes(repoPath);
    if (requestId !== remotesSeq || state.repo?.path !== repoPath) return;
    state.remotes = remotes;
    state.remotesError = null;
  } catch (error) {
    if (requestId !== remotesSeq || state.repo?.path !== repoPath) return;
    state.remotes = [];
    state.remotesError = errorText(error);
  } finally {
    if (requestId === remotesSeq) {
      state.remotesLoading = false;
      renderRemotes();
      if (state.activeTab === 'chat') renderChatHistory();
    }
  }
}

function remoteRowHTML(remote: GitRemoteInfo): string {
  const fetchUrl = remote.fetchUrl || remote.url;
  const pushUrl = remote.pushUrl && remote.pushUrl !== fetchUrl ? remote.pushUrl : '';
  const branches = remote.branches || [];
  const visibleBranches = branches.slice(0, 8);
  const hiddenBranches = branches.length - visibleBranches.length;
  const branchPills = visibleBranches
    .map((branch) => `<span class="remote-branch" title="${esc(branch)}">${esc(branch)}</span>`)
    .join('') + (hiddenBranches > 0 ? `<span class="remote-branch is-more" title="${esc(branches.slice(8).join(', '))}">+${hiddenBranches}</span>` : '');
  const defaultFlag = remote.defaultBranch
    ? `<span class="remote-flag" title="Default branch">${esc(remote.defaultBranch)}</span>`
    : '';
  const fetching = state.fetchingRemote === remote.name;
  const canOpen = /^https?:\/\//i.test(fetchUrl);
  return `<div class="remote-row">
    <span class="remote-mark">${icon('globe')}</span>
    <div class="remote-main">
      <div class="remote-name-line">
        <span class="remote-name">${esc(remote.name)}</span>
        ${defaultFlag}
        <span class="remote-count">${pluralBranch(branches.length)}</span>
      </div>
      <div class="remote-url">
        <span class="remote-url-label">fetch</span>
        <span class="remote-url-value" title="${esc(fetchUrl)}">${esc(fetchUrl)}</span>
      </div>
      ${pushUrl ? `<div class="remote-url">
        <span class="remote-url-label">push</span>
        <span class="remote-url-value" title="${esc(pushUrl)}">${esc(pushUrl)}</span>
      </div>` : ''}
      ${branches.length ? `<div class="remote-branches">${branchPills}</div>` : ''}
    </div>
    <div class="remote-actions">
      <button class="remote-fetch" data-remote-fetch="${esc(remote.name)}"${state.fetchingRemote ? ' disabled' : ''}>${icon('refresh', fetching ? 'spin' : '')}${fetching ? 'Fetching…' : 'Fetch'}</button>
      <button class="remote-action" data-remote-copy="${esc(fetchUrl)}" title="Copy remote URL" aria-label="Copy remote URL">${icon('copy')}</button>
      ${canOpen ? `<button class="remote-action" data-remote-open="${esc(fetchUrl)}" title="Open remote URL" aria-label="Open remote URL">${icon('globe')}</button>` : ''}
    </div>
  </div>`;
}

function renderRemotes(): void {
  const list = $('#remotesList');
  const summary = $('#remotesSummary');
  if (!list) return;
  const repo = state.repo;
  const remotes = state.remotes;
  const count = remotes.length;

  if (summary) {
    if (!repo) summary.textContent = '';
    else if (state.remotesLoading && !count) summary.textContent = 'Loading remotes…';
    else if (state.remotesError) summary.textContent = 'Remotes could not be loaded';
    else summary.textContent = `${plural(count, 'remote')} · ${displayPath(repo.path)}`;
  }

  updateRemotesBadge();
  if (!repo) {
    list.innerHTML = '';
    return;
  }

  const refresh = $<HTMLButtonElement>('[data-action="refresh-remotes"]');
  if (refresh) {
    refresh.disabled = state.remotesLoading;
    refresh.querySelector('.ico')?.classList.toggle('spin', state.remotesLoading);
  }

  if (state.remotesLoading && !count) {
    list.innerHTML = '<div class="remotes-loading"><span class="spinner"></span><span>Loading remotes…</span></div>';
    return;
  }

  if (state.remotesError) {
    list.innerHTML = `<div class="empty-list remotes-empty">
      <span class="e-icon">${icon('alert')}</span>
      <h4>Remotes unavailable</h4>
      <p>${esc(state.remotesError)}</p>
      <button class="btn ghost sm" data-action="refresh-remotes">${icon('refresh')}Try again</button>
    </div>`;
    return;
  }

  if (!count) {
    list.innerHTML = `<div class="empty-list remotes-empty">
      <span class="e-icon">${icon('globe')}</span>
      <h4>No remotes configured</h4>
      <p>This repository has no remotes. Add one with git remote add, then refresh.</p>
      <button class="btn ghost sm" data-action="refresh-remotes">${icon('refresh')}Refresh</button>
    </div>`;
    return;
  }

  const query = state.remotesQuery.trim().toLowerCase();
  const items = remotes.filter((remote) => {
    if (!query) return true;
    return `${remote.name} ${remote.fetchUrl || remote.url} ${remote.pushUrl || ''} ${(remote.branches || []).join(' ')}`
      .toLowerCase()
      .includes(query);
  });

  if (!items.length) {
    list.innerHTML = `<div class="empty-list remotes-empty">
      <span class="e-icon">${icon('search')}</span>
      <h4>No matching remotes</h4>
      <p>Nothing matches “${esc(state.remotesQuery.trim())}”.</p>
      <button class="btn ghost sm" data-action="clear-remotes">Clear filter</button>
    </div>`;
    return;
  }

  list.innerHTML = items.map(remoteRowHTML).join('');
}

async function fetchRemote(remoteName: string): Promise<void> {
  if (!state.repo || !remoteName || state.fetchingRemote || state.busyAction) return;
  const repoPath = state.repo.path;
  state.fetchingRemote = remoteName;
  state.busyAction = 'fetch';
  renderSummary();
  renderRemotes();
  try {
    const output = await api.fetchRemote(repoPath, remoteName, !!state.settings.prune);
    if (state.repo?.path === repoPath) {
      await refreshRepo({ silent: true });
      await refreshSummaries();
    }
    toast(briefGitOutput(output, `Fetched ${remoteName}`), 'success');
  } catch (error) {
    toast(errorText(error), 'warn');
  } finally {
    state.fetchingRemote = null;
    if (state.busyAction === 'fetch') state.busyAction = null;
    renderSummary();
    renderRemotes();
  }
}

function openRemoteUrl(url: string): void {
  if (!/^https?:\/\//i.test(url)) return;
  void api.openExternal(url).catch((error: unknown) => toast(errorText(error), 'warn'));
}

/* ============================================================
   Branches
   ============================================================ */
let branchesSeq = 0;

async function loadBranches(repoPath: string, { silent = false }: { silent?: boolean } = {}): Promise<void> {
  if (!repoPath) return;
  const requestId = ++branchesSeq;
  state.branchesLoading = true;
  if (!silent) renderBranches();
  try {
    const branches = await api.getBranches(repoPath);
    if (requestId !== branchesSeq || state.repo?.path !== repoPath) return;
    state.branches = branches;
    state.branchesError = null;
  } catch (error) {
    if (requestId !== branchesSeq || state.repo?.path !== repoPath) return;
    state.branches = [];
    state.branchesError = errorText(error);
  } finally {
    if (requestId === branchesSeq) {
      state.branchesLoading = false;
      renderBranches();
      if (state.branchModalOpen) renderBranchModal();
    }
  }
}

function branchRowHTML(branch: GitBranchInfo): string {
  const flags: string[] = [];
  if (branch.current) flags.push('<span class="branch-flag is-current">current</span>');
  if (branch.remote) flags.push('<span class="branch-flag">remote</span>');
  if (branch.gone) flags.push(`<span class="branch-flag is-gone" title="${esc(branch.upstream || 'Upstream gone')}">gone</span>`);
  const sync = !branch.remote && branch.upstream && !branch.gone
    ? (branch.ahead || branch.behind
      ? `${branch.ahead ? `<span class="branch-ahead">${icon('arrow-up')}${branch.ahead}</span>` : ''}${branch.behind ? `<span class="branch-behind">${icon('arrow-down')}${branch.behind}</span>` : ''}`
      : `<span class="branch-synced">${icon('check')}up to date</span>`)
    : '';
  const upstream = !branch.remote
    ? `<span class="branch-upstream" title="${esc(branch.upstream || 'No upstream configured')}">${icon('cloud')}${esc(branch.upstream || 'no upstream')}</span>`
    : '';
  const shortHead = branch.head ? branch.head.slice(0, 7) : '—';
  const switching = state.switchingBranch === branch.name;
  return `<div class="branch-row${branch.current ? ' is-current' : ''}${branch.remote ? ' is-remote' : ''}">
    <span class="branch-mark">${icon(branch.current ? 'check' : branch.remote ? 'cloud' : 'branch')}</span>
    <div class="branch-main">
      <div class="branch-name-line">
        <span class="branch-name" title="${esc(branch.name)}">${esc(branch.name)}</span>
        ${flags.join('')}
        ${upstream}
        ${sync}
      </div>
      <div class="branch-commit" title="${esc(branch.subject)}">
        <span class="branch-subject">${esc(branch.subject)}</span>
        <span class="branch-sep">·</span>
        <span class="branch-author">${esc(branch.author)}</span>
        <span class="branch-sep">·</span>
        <span class="branch-when">${esc(branch.when)}</span>
      </div>
    </div>
    <button class="branch-head" data-copy-sha="${esc(branch.head)}" title="Copy commit SHA">${esc(shortHead)}</button>
    <div class="branch-actions">
      <button class="branch-checkout" data-branch-checkout="${esc(branch.name)}" title="Checkout branch"${branch.current || state.busyAction ? ' disabled' : ''}>${icon(switching ? 'refresh' : 'chevron-right', switching ? 'spin' : '')}${switching ? 'Checking out…' : 'Checkout'}</button>
      <button class="branch-action" data-branch-copy="${esc(branch.name)}" title="Copy branch name" aria-label="Copy branch name">${icon('copy')}</button>
    </div>
  </div>`;
}

function renderBranches(): void {
  const list = $('#branchesList');
  const summary = $('#branchesSummary');
  if (!list) return;
  const repo = state.repo;
  const branches = state.branches;
  const count = branches.length;

  if (summary) {
    if (!repo) summary.textContent = '';
    else if (state.branchesLoading && !count) summary.textContent = 'Loading branches…';
    else if (state.branchesError) summary.textContent = 'Branches could not be loaded';
    else summary.textContent = `${pluralBranch(count)} · ${displayPath(repo.path)}`;
  }

  updateBranchesBadge();
  if (!repo) {
    list.innerHTML = '';
    return;
  }

  const refresh = $<HTMLButtonElement>('[data-action="refresh-branches"]');
  if (refresh) {
    refresh.disabled = state.branchesLoading;
    refresh.querySelector('.ico')?.classList.toggle('spin', state.branchesLoading);
  }

  if (state.branchesLoading && !count) {
    list.innerHTML = '<div class="branches-loading"><span class="spinner"></span><span>Loading branches…</span></div>';
    return;
  }

  if (state.branchesError) {
    list.innerHTML = `<div class="empty-list branches-empty">
      <span class="e-icon">${icon('alert')}</span>
      <h4>Branches unavailable</h4>
      <p>${esc(state.branchesError)}</p>
      <button class="btn ghost sm" data-action="refresh-branches">${icon('refresh')}Try again</button>
    </div>`;
    return;
  }

  if (!count) {
    list.innerHTML = `<div class="empty-list branches-empty">
      <span class="e-icon">${icon('git-merge')}</span>
      <h4>No branches yet</h4>
      <p>Make a commit to create the first branch.</p>
      <button class="btn ghost sm" data-action="refresh-branches">${icon('refresh')}Refresh</button>
    </div>`;
    return;
  }

  const query = state.branchesQuery.trim().toLowerCase();
  const items = branches.filter((branch) => {
    if (!query) return true;
    return `${branch.name} ${branch.upstream || ''} ${branch.author} ${branch.subject}`
      .toLowerCase()
      .includes(query);
  });

  if (!items.length) {
    list.innerHTML = `<div class="empty-list branches-empty">
      <span class="e-icon">${icon('search')}</span>
      <h4>No matching branches</h4>
      <p>Nothing matches “${esc(state.branchesQuery.trim())}”.</p>
      <button class="btn ghost sm" data-action="clear-branches">Clear filter</button>
    </div>`;
    return;
  }

  list.innerHTML = items.map(branchRowHTML).join('');
}

async function checkoutBranchAction(branchName: string): Promise<boolean> {
  if (!state.repo || !branchName || state.switchingBranch || state.busyAction) return false;
  const repoPath = state.repo.path;
  state.switchingBranch = branchName;
  state.busyAction = 'checkout';
  renderSummary();
  renderBranches();
  try {
    const result = await api.checkoutBranch(repoPath, branchName);
    if (state.repo?.path === repoPath) {
      await refreshRepo({ silent: true });
      await refreshSummaries();
    }
    toast(`Switched to ${result.branch}`, 'success');
    return true;
  } catch (error) {
    toast(errorText(error), 'warn');
    return false;
  } finally {
    state.switchingBranch = null;
    if (state.busyAction === 'checkout') state.busyAction = null;
    renderSummary();
    renderBranches();
  }
}

function branchLocalName(branchName: string): string {
  const remotes = state.remotes.map((remote) => remote.name).sort((a, b) => b.length - a.length);
  const remote = remotes.find((name) => branchName.startsWith(`${name}/`));
  return remote ? branchName.slice(remote.length + 1) : branchName.split('/').slice(1).join('/');
}

function branchPickRowHTML(branch: GitBranchInfo, baseName: string | null): string {
  const flags: string[] = [];
  if (branch.current) flags.push('<span class="branch-flag is-current">current</span>');
  if (branch.remote) flags.push('<span class="branch-flag">remote</span>');
  if (branch.gone) flags.push('<span class="branch-flag is-gone">gone</span>');
  const selected = branch.name === baseName;
  return `<div class="branch-pick-row${selected ? ' is-selected' : ''}">
    <button class="branch-pick-select" role="option" aria-selected="${selected}" data-branch-base="${esc(branch.name)}" title="Use ${esc(branch.name)} as the starting point">
      <span class="branch-pick-radio" aria-hidden="true"></span>
      <span class="branch-pick-main">
        <span class="branch-pick-name-line">
          <span class="branch-pick-name">${esc(branch.name)}</span>
          ${flags.join('')}
        </span>
        <span class="branch-pick-subject">${esc(branch.subject || '—')}<span class="dot"> · </span>${esc(branch.author || '—')}<span class="dot"> · </span>${esc(branch.when || '—')}</span>
      </span>
    </button>
    <button class="branch-pick-switch" data-branch-switch="${esc(branch.name)}" title="Switch to ${esc(branch.name)}"${branch.current ? ' disabled' : ''}>${branch.current ? 'Current' : 'Switch'}</button>
  </div>`;
}

function syncBranchCreateButton(): void {
  const input = $<HTMLInputElement>('#branchNameInput');
  const button = $<HTMLButtonElement>('#branchCreateBtn');
  if (!button) return;
  button.disabled = !state.branchModalOpen || !state.branchModalBase || !(input?.value.trim());
}

function renderBranchModal(): void {
  const list = $('#branchPickList');
  if (!list) return;
  const branches = state.branches;
  const base = branches.find((branch) => branch.name === state.branchModalBase)
    || branches.find((branch) => branch.current)
    || branches[0]
    || null;
  state.branchModalBase = base?.name || null;

  const query = state.branchModalQuery.trim().toLowerCase();
  const items = query
    ? branches.filter((branch) => `${branch.name} ${branch.upstream || ''} ${branch.author} ${branch.subject}`.toLowerCase().includes(query))
    : branches;

  if (state.branchesLoading && !branches.length) {
    list.innerHTML = '<div class="branch-pick-empty">Loading branches…</div>';
  } else if (state.branchesError) {
    list.innerHTML = '<div class="branch-pick-empty">Branches could not be loaded.</div>';
  } else if (!branches.length) {
    list.innerHTML = '<div class="branch-pick-empty">No branches yet — make a commit first.</div>';
  } else if (!items.length) {
    list.innerHTML = `<div class="branch-pick-empty">No branches match “${esc(state.branchModalQuery.trim())}”.</div>`;
  } else {
    list.innerHTML = items.map((branch) => branchPickRowHTML(branch, state.branchModalBase)).join('');
  }

  const baseName = $('#branchBaseName');
  if (baseName) baseName.textContent = base?.name || '—';
  const hint = $('#branchCreateHint');
  if (hint) {
    if (!base) {
      hint.textContent = 'Select a branch to start from.';
    } else if (base.remote) {
      const localName = branchLocalName(base.name);
      const exists = branches.some((branch) => !branch.remote && branch.name === localName);
      hint.textContent = exists
        ? `Switching reuses the local branch '${localName}', which tracks this remote branch.`
        : `A new branch tracks '${base.name}'; switching to it creates a local tracking branch.`;
    } else {
      hint.textContent = `The new branch starts at '${base.name}' and is checked out immediately.`;
    }
  }
  syncBranchCreateButton();
}

function openBranchModal(): void {
  if (!state.repo) return;
  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  state.branchModalOpen = true;
  state.branchModalQuery = '';
  const branches = state.branches;
  state.branchModalBase = (branches.find((branch) => branch.current) || branches[0])?.name || null;
  const filter = $<HTMLInputElement>('#branchFilter');
  if (filter) filter.value = '';
  const nameInput = $<HTMLInputElement>('#branchNameInput');
  if (nameInput) nameInput.value = '';
  if (!branches.length) state.branchesLoading = true;
  renderBranchModal();
  const backdrop = $<HTMLElement>('#branchBackdrop');
  backdrop?.classList.add('is-open');
  backdrop?.setAttribute('aria-hidden', 'false');
  const repoPath = state.repo.path;
  void loadBranches(repoPath, { silent: true }).then(() => {
    if (!state.branchModalOpen || state.repo?.path !== repoPath) return;
    if (!state.branchModalBase || !state.branches.some((branch) => branch.name === state.branchModalBase)) {
      state.branchModalBase = (state.branches.find((branch) => branch.current) || state.branches[0])?.name || null;
    }
    renderBranchModal();
  });
  setTimeout(() => filter?.focus({ preventScroll: true }), 90);
}

function closeBranchModal(): void {
  state.branchModalOpen = false;
  const backdrop = $<HTMLElement>('#branchBackdrop');
  backdrop?.classList.remove('is-open');
  backdrop?.setAttribute('aria-hidden', 'true');
  if (lastFocusedElement?.focus) lastFocusedElement.focus();
}

async function switchBranchFromModal(branchName: string): Promise<void> {
  if (!state.branchModalOpen) return;
  const branch = state.branches.find((entry) => entry.name === branchName);
  if (!branch) return;
  if (branch.current) {
    toast(`Already on '${branch.name}'`, 'info');
    return;
  }
  const switched = await checkoutBranchAction(branchName);
  if (switched) closeBranchModal();
}

async function createBranchFromModal(): Promise<void> {
  if (!state.repo || !state.branchModalOpen || state.creatingBranch) return;
  const input = $<HTMLInputElement>('#branchNameInput');
  const name = input?.value.trim() || '';
  const base = state.branchModalBase;
  if (!name) {
    input?.focus();
    toast('Enter a branch name', 'warn');
    return;
  }
  if (!base) {
    toast('Select a branch to start from', 'warn');
    return;
  }
  const repoPath = state.repo.path;
  state.creatingBranch = true;
  syncBranchCreateButton();
  try {
    const result = await api.createBranch(repoPath, name, base);
    if (state.repo?.path === repoPath) {
      await refreshRepo({ silent: true });
      await refreshSummaries();
    }
    closeBranchModal();
    toast(`Created and switched to ${result.branch}`, 'success');
  } catch (error) {
    toast(errorText(error), 'warn');
  } finally {
    state.creatingBranch = false;
    syncBranchCreateButton();
  }
}

/* ============================================================
   Tags
   ============================================================ */
let tagsSeq = 0;

async function loadTags(repoPath: string, { silent = false }: { silent?: boolean } = {}): Promise<void> {
  if (!repoPath) return;
  const requestId = ++tagsSeq;
  state.tagsLoading = true;
  if (!silent) renderTags();
  try {
    const tags = await api.getTags(repoPath);
    if (requestId !== tagsSeq || state.repo?.path !== repoPath) return;
    state.tags = tags;
    state.tagsError = null;
  } catch (error) {
    if (requestId !== tagsSeq || state.repo?.path !== repoPath) return;
    state.tags = [];
    state.tagsError = errorText(error);
  } finally {
    if (requestId === tagsSeq) {
      state.tagsLoading = false;
      renderTags();
    }
  }
}

function tagRowHTML(tag: GitTagInfo): string {
  const flags: string[] = [];
  if (tag.targetType === 'commit') {
    flags.push(`<span class="tag-flag${tag.annotated ? ' is-annotated' : ''}">${tag.annotated ? 'annotated' : 'lightweight'}</span>`);
  } else {
    flags.push(`<span class="tag-flag is-type">${esc(tag.targetType)}</span>`);
  }
  if (tag.atHead) flags.push('<span class="tag-flag is-head">HEAD</span>');
  const note = tag.annotated
    ? `<div class="tag-note" title="${esc(tag.annotation || '')}">
        ${tag.annotation ? `<span class="tag-annotation">“${esc(tag.annotation)}”</span><span class="tag-sep">·</span>` : ''}
        <span class="tag-note-label">tagged by</span>
        <span class="tag-tagger">${esc(tag.tagger || '—')}</span>
        ${tag.when ? `<span class="tag-sep">·</span><span class="tag-tag-when">${esc(tag.when)}</span>` : ''}
      </div>`
    : '';
  const shortHead = tag.head ? tag.head.slice(0, 7) : '—';
  const checking = state.checkingOutTag === tag.name;
  const canCheckout = tag.targetType === 'commit';
  return `<div class="tag-row${tag.atHead ? ' is-head' : ''}">
    <span class="tag-mark">${icon('tag')}</span>
    <div class="tag-main">
      <div class="tag-name-line">
        <span class="tag-name" title="${esc(tag.name)}">${esc(tag.name)}</span>
        ${flags.join('')}
      </div>
      <div class="tag-commit" title="${esc(tag.subject)}">
        <span class="tag-subject">${esc(tag.subject || '—')}</span>
        ${tag.author ? `<span class="tag-sep">·</span><span class="tag-author">${esc(tag.author)}</span>` : ''}
        ${tag.commitWhen ? `<span class="tag-sep">·</span><span class="tag-commit-when">${esc(tag.commitWhen)}</span>` : ''}
      </div>
      ${note}
    </div>
    <button class="tag-head" data-copy-sha="${esc(tag.head)}" title="Copy commit SHA">${esc(shortHead)}</button>
    <div class="tag-actions">
      <button class="tag-checkout" data-tag-checkout="${esc(tag.name)}" title="${canCheckout ? 'Checkout tag' : 'Tag does not point to a commit'}"${!canCheckout || state.busyAction ? ' disabled' : ''}>${icon(checking ? 'refresh' : 'chevron-right', checking ? 'spin' : '')}${checking ? 'Checking out…' : 'Checkout'}</button>
      <button class="tag-action" data-tag-copy="${esc(tag.name)}" title="Copy tag name" aria-label="Copy tag name">${icon('copy')}</button>
    </div>
  </div>`;
}

function renderTags(): void {
  const list = $('#tagsList');
  const summary = $('#tagsSummary');
  if (!list) return;
  const repo = state.repo;
  const tags = state.tags;
  const count = tags.length;

  if (summary) {
    if (!repo) summary.textContent = '';
    else if (state.tagsLoading && !count) summary.textContent = 'Loading tags…';
    else if (state.tagsError) summary.textContent = 'Tags could not be loaded';
    else summary.textContent = `${plural(count, 'tag')} · ${displayPath(repo.path)}`;
  }

  updateTagsBadge();
  if (!repo) {
    list.innerHTML = '';
    return;
  }

  const refresh = $<HTMLButtonElement>('[data-action="refresh-tags"]');
  if (refresh) {
    refresh.disabled = state.tagsLoading;
    refresh.querySelector('.ico')?.classList.toggle('spin', state.tagsLoading);
  }

  if (state.tagsLoading && !count) {
    list.innerHTML = '<div class="tags-loading"><span class="spinner"></span><span>Loading tags…</span></div>';
    return;
  }

  if (state.tagsError) {
    list.innerHTML = `<div class="empty-list tags-empty">
      <span class="e-icon">${icon('alert')}</span>
      <h4>Tags unavailable</h4>
      <p>${esc(state.tagsError)}</p>
      <button class="btn ghost sm" data-action="refresh-tags">${icon('refresh')}Try again</button>
    </div>`;
    return;
  }

  if (!count) {
    list.innerHTML = `<div class="empty-list tags-empty">
      <span class="e-icon">${icon('tag')}</span>
      <h4>No tags yet</h4>
      <p>Create a tag with git tag NAME and it will appear here.</p>
      <button class="btn ghost sm" data-action="refresh-tags">${icon('refresh')}Refresh</button>
    </div>`;
    return;
  }

  const query = state.tagsQuery.trim().toLowerCase();
  const items = tags.filter((tag) => {
    if (!query) return true;
    return `${tag.name} ${tag.subject} ${tag.author} ${tag.annotation || ''} ${tag.tagger || ''}`
      .toLowerCase()
      .includes(query);
  });

  if (!items.length) {
    list.innerHTML = `<div class="empty-list tags-empty">
      <span class="e-icon">${icon('search')}</span>
      <h4>No matching tags</h4>
      <p>Nothing matches “${esc(state.tagsQuery.trim())}”.</p>
      <button class="btn ghost sm" data-action="clear-tags">Clear filter</button>
    </div>`;
    return;
  }

  list.innerHTML = items.map(tagRowHTML).join('');
}

async function checkoutTagAction(tagName: string): Promise<void> {
  if (!state.repo || !tagName || state.checkingOutTag || state.busyAction) return;
  const repoPath = state.repo.path;
  state.checkingOutTag = tagName;
  state.busyAction = 'checkout';
  renderSummary();
  renderTags();
  try {
    const result = await api.checkoutTag(repoPath, tagName);
    if (state.repo?.path === repoPath) {
      await refreshRepo({ silent: true });
      await refreshSummaries();
    }
    toast(`Checked out tag ${result.tag}`, 'success');
  } catch (error) {
    toast(errorText(error), 'warn');
  } finally {
    state.checkingOutTag = null;
    if (state.busyAction === 'checkout') state.busyAction = null;
    renderSummary();
    renderTags();
  }
}

/* ============================================================
   Stashes
   ============================================================ */
let stashesSeq = 0;

function pluralStash(count: number): string {
  return `${count} ${count === 1 ? 'stash' : 'stashes'}`;
}

async function loadStashes(repoPath: string, { silent = false }: { silent?: boolean } = {}): Promise<void> {
  if (!repoPath) return;
  const requestId = ++stashesSeq;
  state.stashesLoading = true;
  if (!silent) renderStashes();
  try {
    const stashes = await api.getStashes(repoPath);
    if (requestId !== stashesSeq || state.repo?.path !== repoPath) return;
    state.stashes = stashes;
    state.stashesError = null;
  } catch (error) {
    if (requestId !== stashesSeq || state.repo?.path !== repoPath) return;
    state.stashes = [];
    state.stashesError = errorText(error);
  } finally {
    if (requestId === stashesSeq) {
      state.stashesLoading = false;
      renderStashes();
    }
  }
}

function stashStatsHTML(stash: GitStashInfo): string {
  if (!stash.files) return '<span class="stash-files">—</span>';
  const files = `<span class="stash-files">${plural(stash.files, 'file')}</span>`;
  if (stash.binary) return `<span class="stash-files">binary</span>${files}`;
  return `<span class="stash-add">+${stash.add}</span><span class="stash-del">−${stash.del}</span>${files}`;
}

function stashRowHTML(stash: GitStashInfo): string {
  const active = state.stashAction?.ref === stash.ref ? state.stashAction.action : null;
  const shortSha = stash.sha ? stash.sha.slice(0, 7) : '—';
  const branch = stash.branch
    ? `<span class="stash-branch" title="${esc(stash.branch)}">${icon('branch')}${esc(stash.branch)}</span>`
    : '';
  const base = stash.base
    ? `<div class="stash-base" title="${esc(stash.baseSubject)}">
        <span class="stash-base-label">base</span>
        <span class="stash-base-sha">${esc(stash.base.slice(0, 7))}</span>
        <span class="stash-sep">·</span>
        <span class="stash-base-subject">${esc(stash.baseSubject || '—')}</span>
      </div>`
    : '';
  const disabled = state.busyAction ? ' disabled' : '';
  const spinner = (action: StashAction): string => (active === action ? icon('refresh', 'spin') : '');
  return `<div class="stash-row">
    <span class="stash-mark">${icon('download')}</span>
    <div class="stash-main">
      <div class="stash-name-line">
        <span class="stash-ref">${esc(stash.ref)}</span>
        ${branch}
        <span class="stash-when">${esc(stash.when)}</span>
        <span class="stash-stats">${stashStatsHTML(stash)}</span>
      </div>
      <div class="stash-message" title="${esc(stash.message)}">${esc(stash.message)}</div>
      ${base}
    </div>
    <button class="stash-head" data-copy-sha="${esc(stash.sha)}" title="Copy commit SHA">${esc(shortSha)}</button>
    <div class="stash-actions">
      <button class="stash-action" data-stash-action="apply" data-stash-ref="${esc(stash.ref)}" title="Apply stash"${disabled}>${spinner('apply')}Apply</button>
      <button class="stash-action" data-stash-action="pop" data-stash-ref="${esc(stash.ref)}" title="Pop stash"${disabled}>${spinner('pop')}Pop</button>
      <button class="stash-action is-danger" data-stash-action="drop" data-stash-ref="${esc(stash.ref)}" title="Drop stash"${disabled}>${spinner('drop')}Drop</button>
      <button class="stash-copy" data-stash-copy="${esc(stash.ref)}" title="Copy stash reference" aria-label="Copy stash reference">${icon('copy')}</button>
    </div>
  </div>`;
}

function renderStashes(): void {
  const list = $('#stashesList');
  const summary = $('#stashesSummary');
  if (!list) return;
  const repo = state.repo;
  const stashes = state.stashes;
  const count = stashes.length;

  if (summary) {
    if (!repo) summary.textContent = '';
    else if (state.stashesLoading && !count) summary.textContent = 'Loading stashes…';
    else if (state.stashesError) summary.textContent = 'Stashes could not be loaded';
    else summary.textContent = `${pluralStash(count)} · ${displayPath(repo.path)}`;
  }

  updateStashesBadge();
  if (!repo) {
    list.innerHTML = '';
    return;
  }

  const refresh = $<HTMLButtonElement>('[data-action="refresh-stashes"]');
  if (refresh) {
    refresh.disabled = state.stashesLoading;
    refresh.querySelector('.ico')?.classList.toggle('spin', state.stashesLoading);
  }

  if (state.stashesLoading && !count) {
    list.innerHTML = '<div class="stashes-loading"><span class="spinner"></span><span>Loading stashes…</span></div>';
    return;
  }

  if (state.stashesError) {
    list.innerHTML = `<div class="empty-list stashes-empty">
      <span class="e-icon">${icon('alert')}</span>
      <h4>Stashes unavailable</h4>
      <p>${esc(state.stashesError)}</p>
      <button class="btn ghost sm" data-action="refresh-stashes">${icon('refresh')}Try again</button>
    </div>`;
    return;
  }

  if (!count) {
    list.innerHTML = `<div class="empty-list stashes-empty">
      <span class="e-icon">${icon('download')}</span>
      <h4>No stashes yet</h4>
      <p>Run git stash to save work in progress; it will appear here.</p>
      <button class="btn ghost sm" data-action="refresh-stashes">${icon('refresh')}Refresh</button>
    </div>`;
    return;
  }

  const query = state.stashesQuery.trim().toLowerCase();
  const items = stashes.filter((stash) => {
    if (!query) return true;
    return `${stash.ref} ${stash.sha} ${stash.branch || ''} ${stash.message} ${stash.baseSubject}`
      .toLowerCase()
      .includes(query);
  });

  if (!items.length) {
    list.innerHTML = `<div class="empty-list stashes-empty">
      <span class="e-icon">${icon('search')}</span>
      <h4>No matching stashes</h4>
      <p>Nothing matches “${esc(state.stashesQuery.trim())}”.</p>
      <button class="btn ghost sm" data-action="clear-stashes">Clear filter</button>
    </div>`;
    return;
  }

  list.innerHTML = items.map(stashRowHTML).join('');
}

async function performStashAction(ref: string, action: StashAction): Promise<void> {
  if (!state.repo || !ref || state.stashAction || state.busyAction) return;
  if (action === 'drop') {
    const confirmed = window.confirm(isChinese()
      ? `删除 ${ref}？此操作无法撤销。`
      : `Drop ${ref}? This cannot be undone.`);
    if (!confirmed) return;
  }
  const repoPath = state.repo.path;
  state.stashAction = { ref, action };
  state.busyAction = 'stash';
  renderSummary();
  renderStashes();
  try {
    await api.runStashAction(repoPath, ref, action);
    if (state.repo?.path === repoPath) {
      await refreshRepo({ silent: true });
      await refreshSummaries();
    }
    const label = action === 'apply' ? 'Applied' : action === 'pop' ? 'Popped' : 'Dropped';
    toast(`${label} ${ref}`, 'success');
  } catch (error) {
    toast(errorText(error), 'warn');
  } finally {
    state.stashAction = null;
    if (state.busyAction === 'stash') state.busyAction = null;
    renderSummary();
    renderStashes();
  }
}

/* ============================================================
   LFS
   ============================================================ */
let lfsSeq = 0;

async function loadLfsReport(repoPath: string, { silent = false }: { silent?: boolean } = {}): Promise<void> {
  if (!repoPath) return;
  const requestId = ++lfsSeq;
  state.lfsLoading = true;
  if (!silent) renderLfs();
  try {
    const report = await api.getLfsReport(repoPath);
    if (requestId !== lfsSeq || state.repo?.path !== repoPath) return;
    state.lfsReport = report;
    state.lfsError = null;
  } catch (error) {
    if (requestId !== lfsSeq || state.repo?.path !== repoPath) return;
    state.lfsReport = null;
    state.lfsError = errorText(error);
  } finally {
    if (requestId === lfsSeq) {
      state.lfsLoading = false;
      renderLfs();
    }
  }
}

function lfsFileRowHTML(file: GitLfsFile): string {
  const flags: string[] = [];
  if (file.pointer) flags.push('<span class="lfs-flag is-pointer">pointer</span>');
  if (file.missing) flags.push('<span class="lfs-flag is-missing">missing</span>');
  const oid = file.oid
    ? `<span class="lfs-oid" title="sha256:${esc(file.oid)}">sha256:${esc(file.oid.slice(0, 10))}</span>`
    : '';
  const disabled = file.missing ? ' disabled' : '';
  return `<div class="lfs-row">
    <span class="lfs-mark">${icon('file')}</span>
    <div class="lfs-main">
      <div class="lfs-path" title="${esc(file.path)}">${esc(file.path)}</div>
      <div class="lfs-meta">
        <span class="lfs-size">${fmtBytes(file.size)}</span>
        ${flags.join('')}
        ${oid}
      </div>
    </div>
    <div class="lfs-actions">
      <button class="lfs-action" data-lfs-open="${esc(file.path)}" title="Open file" aria-label="Open file"${disabled}>${icon('file-code')}</button>
      <button class="lfs-action" data-lfs-reveal="${esc(file.path)}" title="Reveal in Finder" aria-label="Reveal in Finder"${disabled}>${icon('folder')}</button>
      <button class="lfs-action" data-copy-path="${esc(file.path)}" title="Copy path" aria-label="Copy path">${icon('copy')}</button>
    </div>
  </div>`;
}

function largeFileRowHTML(file: GitLargeFile): string {
  const when = file.mtimeMs
    ? `<span class="lfs-when" title="Last modified">${icon('clock')}${esc(timeAgo(new Date(file.mtimeMs).toISOString()))}</span>`
    : '';
  return `<div class="lfs-row">
    <span class="lfs-mark">${icon('file')}</span>
    <div class="lfs-main">
      <div class="lfs-path" title="${esc(file.path)}">${esc(file.path)}</div>
      <div class="lfs-meta">
        <span class="lfs-size">${fmtBytes(file.size)}</span>
        <span class="lfs-flag ${file.tracked ? 'is-tracked' : 'is-untracked'}">${file.tracked ? 'tracked' : 'untracked'}</span>
        ${when}
      </div>
    </div>
    <div class="lfs-actions">
      <button class="lfs-action" data-lfs-open="${esc(file.path)}" title="Open file" aria-label="Open file">${icon('file-code')}</button>
      <button class="lfs-action" data-lfs-reveal="${esc(file.path)}" title="Reveal in Finder" aria-label="Reveal in Finder">${icon('folder')}</button>
      <button class="lfs-action" data-copy-path="${esc(file.path)}" title="Copy path" aria-label="Copy path">${icon('copy')}</button>
    </div>
  </div>`;
}

function lfsEmptyHTML(kind: 'lfs' | 'large', filtered: boolean): string {
  if (filtered) {
    return `<div class="empty-list lfs-empty">
      <span class="e-icon">${icon('search')}</span>
      <h4>No matching ${kind === 'lfs' ? 'LFS files' : 'large files'}</h4>
      <p>Nothing matches “${esc(state.lfsQuery.trim())}”.</p>
      <button class="btn ghost sm" data-action="clear-lfs">Clear filter</button>
    </div>`;
  }
  return kind === 'lfs'
    ? `<div class="empty-list lfs-empty">
      <span class="e-icon">${icon('file')}</span>
      <h4>No LFS files</h4>
      <p>Track files with Git LFS and they will appear here.</p>
    </div>`
    : `<div class="empty-list lfs-empty">
      <span class="e-icon">${icon('folder')}</span>
      <h4>No large files</h4>
      <p>No non-LFS files over ${fmtBytes(state.lfsReport?.threshold || 5 * 1024 * 1024)}.</p>
    </div>`;
}

function renderLfs(): void {
  const summary = $('#lfsSummary');
  const split = $<HTMLElement>('#lfsSplit');
  const stateEl = $<HTMLElement>('#lfsState');
  const lfsList = $('#lfsList');
  const largeList = $('#largeList');
  if (!summary || !split || !stateEl || !lfsList || !largeList) return;
  const report = state.lfsReport;
  const lfsCount = report?.lfs.length || 0;
  const largeCount = report?.large.length || 0;

  if (!state.repo) {
    summary.textContent = '';
    split.hidden = true;
    stateEl.hidden = true;
    return;
  }

  updateLfsBadge();

  if (state.lfsLoading && !report) {
    summary.textContent = 'Loading LFS files…';
    split.hidden = true;
    stateEl.hidden = false;
    stateEl.innerHTML = '<span class="spinner"></span><span>Loading LFS files…</span>';
    return;
  }

  if (state.lfsError) {
    summary.textContent = 'LFS files could not be loaded';
    split.hidden = true;
    stateEl.hidden = false;
    stateEl.innerHTML = `<span class="e-icon">${icon('alert')}</span>
      <h4>LFS files unavailable</h4>
      <p>${esc(state.lfsError)}</p>
      <button class="btn ghost sm" data-action="refresh-lfs">${icon('refresh')}Try again</button>`;
    return;
  }

  split.hidden = false;
  stateEl.hidden = true;
  summary.textContent = `${plural(lfsCount, 'LFS file')} · ${plural(largeCount, 'large file')}`;
  updateLfsBadge();

  const lfsCountEl = $('#lfsCount');
  if (lfsCountEl) lfsCountEl.textContent = String(lfsCount);
  const largeCountEl = $('#largeCount');
  if (largeCountEl) largeCountEl.textContent = String(largeCount);
  const lfsTotal = $('#lfsTotal');
  if (lfsTotal) lfsTotal.textContent = report?.lfs.length
    ? fmtBytes(report.lfs.reduce((sum, file) => sum + file.size, 0))
    : '';
  const largeHint = $('#largeHint');
  if (largeHint) largeHint.textContent = `> ${fmtBytes(report?.threshold || 5 * 1024 * 1024)}`;

  const refresh = $<HTMLButtonElement>('[data-action="refresh-lfs"]');
  if (refresh) {
    refresh.disabled = state.lfsLoading;
    refresh.querySelector('.ico')?.classList.toggle('spin', state.lfsLoading);
  }

  const query = state.lfsQuery.trim().toLowerCase();
  const lfsFiles = (report?.lfs || []).filter((file) => !query || file.path.toLowerCase().includes(query));
  const largeFiles = (report?.large || []).filter((file) => !query || file.path.toLowerCase().includes(query));

  lfsList.innerHTML = lfsFiles.length
    ? lfsFiles.map(lfsFileRowHTML).join('')
    : lfsEmptyHTML('lfs', !!query);
  largeList.innerHTML = largeFiles.length
    ? largeFiles.map(largeFileRowHTML).join('')
    : lfsEmptyHTML('large', !!query);
}

function openLfsPath(filePath: string): void {
  if (!state.repo || !filePath) return;
  void api.openPath(state.repo.path, filePath).catch((error: unknown) => toast(errorText(error), 'warn'));
}

function revealLfsPath(filePath: string): void {
  if (!state.repo || !filePath) return;
  void api.revealPath(state.repo.path, filePath).catch((error: unknown) => toast(errorText(error), 'warn'));
}

/* ============================================================
   Submodules
   ============================================================ */
let submodulesSeq = 0;

const SUBMODULE_STATUS_LABELS: Record<SubmoduleStatus, string> = {
  current: 'up to date',
  modified: 'modified',
  uninitialized: 'uninitialized',
  conflicted: 'conflicted'
};

async function loadSubmodules(repoPath: string, { silent = false }: { silent?: boolean } = {}): Promise<void> {
  if (!repoPath) return;
  const requestId = ++submodulesSeq;
  state.submodulesLoading = true;
  if (!silent) renderSubmodules();
  try {
    const submodules = await api.getSubmodules(repoPath);
    if (requestId !== submodulesSeq || state.repo?.path !== repoPath) return;
    state.submodules = submodules;
    state.submodulesError = null;
  } catch (error) {
    if (requestId !== submodulesSeq || state.repo?.path !== repoPath) return;
    state.submodules = [];
    state.submodulesError = errorText(error);
  } finally {
    if (requestId === submodulesSeq) {
      state.submodulesLoading = false;
      renderSubmodules();
    }
  }
}

function submoduleRowHTML(submodule: GitSubmoduleInfo): string {
  const shortIndex = submodule.indexSha ? submodule.indexSha.slice(0, 7) : '—';
  const shortHead = submodule.headSha ? submodule.headSha.slice(0, 7) : '';
  const flags: string[] = [
    `<span class="sub-flag is-${submodule.status}">${SUBMODULE_STATUS_LABELS[submodule.status]}</span>`
  ];
  if (submodule.dirty) flags.push('<span class="sub-flag is-dirty">dirty</span>');
  const displayBranch = submodule.currentBranch || submodule.branch;
  const branch = displayBranch
    ? `<span class="sub-branch" title="${esc(displayBranch)}">${icon('branch')}${esc(displayBranch)}</span>`
    : '';
  const shas = `<span class="sub-shas"><span class="k">index</span><span class="v">${esc(shortIndex)}</span>${shortHead && submodule.headSha !== submodule.indexSha ? `<span class="k">head</span><span class="v">${esc(shortHead)}</span>` : ''}</span>`;
  const describe = submodule.describe ? `<span class="sub-describe">${esc(submodule.describe)}</span>` : '';
  const commit = submodule.headSha
    ? `<div class="sub-commit" title="${esc(submodule.subject)}">
        <span class="sub-subject">${esc(submodule.subject || '—')}</span>
        ${submodule.author ? `<span class="sub-sep">·</span><span class="sub-author">${esc(submodule.author)}</span>` : ''}
        ${submodule.when ? `<span class="sub-sep">·</span><span class="sub-when">${esc(submodule.when)}</span>` : ''}
      </div>`
    : '<div class="sub-commit"><span class="sub-not-init">Not initialized</span></div>';
  const initialized = !!submodule.headSha;
  const updating = state.updatingSubmodule === submodule.path;
  return `<div class="sub-row${submodule.dirty ? ' is-dirty' : ''}">
    <span class="sub-mark">${icon('folder')}</span>
    <div class="sub-main">
      <div class="sub-name-line">
        <span class="sub-path" title="${esc(submodule.path)}">${esc(submodule.path)}</span>
        ${flags.join('')}
        ${branch}
      </div>
      <div class="sub-meta-line">
        <span class="sub-url" title="${esc(submodule.url)}">${icon('globe')}${esc(submodule.url || '—')}</span>
        ${shas}
        ${describe}
      </div>
      ${commit}
    </div>
    <button class="sub-head" data-copy-sha="${esc(submodule.indexSha)}" title="Copy index SHA">${esc(shortIndex)}</button>
    <div class="sub-actions">
      <button class="sub-update" data-submodule-update="${esc(submodule.path)}" title="Update submodule"${state.busyAction ? ' disabled' : ''}>${icon(updating ? 'refresh' : 'download', updating ? 'spin' : '')}${updating ? 'Updating…' : 'Update'}</button>
      <button class="sub-action" data-submodule-open="${esc(submodule.path)}" title="Open in GitGlance" aria-label="Open in GitGlance"${initialized ? '' : ' disabled'}>${icon('chevron-right')}</button>
      <button class="sub-action" data-submodule-reveal="${esc(submodule.path)}" title="Reveal in Finder" aria-label="Reveal in Finder"${initialized ? '' : ' disabled'}>${icon('folder')}</button>
      <button class="sub-action" data-copy-path="${esc(submodule.path)}" title="Copy path" aria-label="Copy path">${icon('copy')}</button>
    </div>
  </div>`;
}

function renderSubmodules(): void {
  const list = $('#submodulesList');
  const summary = $('#submodulesSummary');
  if (!list) return;
  const repo = state.repo;
  const submodules = state.submodules;
  const count = submodules.length;

  if (summary) {
    if (!repo) summary.textContent = '';
    else if (state.submodulesLoading && !count) summary.textContent = 'Loading submodules…';
    else if (state.submodulesError) summary.textContent = 'Submodules could not be loaded';
    else summary.textContent = `${plural(count, 'submodule')} · ${displayPath(repo.path)}`;
  }

  updateSubmodulesBadge();
  if (!repo) {
    list.innerHTML = '';
    return;
  }

  const refresh = $<HTMLButtonElement>('[data-action="refresh-submodules"]');
  if (refresh) {
    refresh.disabled = state.submodulesLoading;
    refresh.querySelector('.ico')?.classList.toggle('spin', state.submodulesLoading);
  }

  if (state.submodulesLoading && !count) {
    list.innerHTML = '<div class="submodules-loading"><span class="spinner"></span><span>Loading submodules…</span></div>';
    return;
  }

  if (state.submodulesError) {
    list.innerHTML = `<div class="empty-list submodules-empty">
      <span class="e-icon">${icon('alert')}</span>
      <h4>Submodules unavailable</h4>
      <p>${esc(state.submodulesError)}</p>
      <button class="btn ghost sm" data-action="refresh-submodules">${icon('refresh')}Try again</button>
    </div>`;
    return;
  }

  if (!count) {
    list.innerHTML = `<div class="empty-list submodules-empty">
      <span class="e-icon">${icon('folder')}</span>
      <h4>No submodules</h4>
      <p>Add a submodule with git submodule add URL PATH.</p>
      <button class="btn ghost sm" data-action="refresh-submodules">${icon('refresh')}Refresh</button>
    </div>`;
    return;
  }

  const query = state.submodulesQuery.trim().toLowerCase();
  const items = submodules.filter((submodule) => {
    if (!query) return true;
    return `${submodule.path} ${submodule.url} ${submodule.branch || ''} ${submodule.status} ${submodule.subject} ${submodule.author}`
      .toLowerCase()
      .includes(query);
  });

  if (!items.length) {
    list.innerHTML = `<div class="empty-list submodules-empty">
      <span class="e-icon">${icon('search')}</span>
      <h4>No matching submodules</h4>
      <p>Nothing matches “${esc(state.submodulesQuery.trim())}”.</p>
      <button class="btn ghost sm" data-action="clear-submodules">Clear filter</button>
    </div>`;
    return;
  }

  list.innerHTML = items.map(submoduleRowHTML).join('');
}

async function updateSubmoduleAction(submodulePath: string): Promise<void> {
  if (!state.repo || !submodulePath || state.updatingSubmodule || state.busyAction) return;
  const repoPath = state.repo.path;
  state.updatingSubmodule = submodulePath;
  state.busyAction = 'submodule';
  renderSummary();
  renderSubmodules();
  try {
    await api.updateSubmodule(repoPath, submodulePath);
    if (state.repo?.path === repoPath) {
      await refreshRepo({ silent: true });
      await refreshSummaries();
    }
    toast(`Updated ${submodulePath}`, 'success');
  } catch (error) {
    toast(errorText(error), 'warn');
  } finally {
    state.updatingSubmodule = null;
    if (state.busyAction === 'submodule') state.busyAction = null;
    renderSummary();
    renderSubmodules();
  }
}

async function openSubmoduleAction(submodulePath: string): Promise<void> {
  if (!state.repo || !submodulePath) return;
  try {
    const result = await api.openSubmodule(state.repo.path, submodulePath);
    applyBootstrap(result.bootstrap);
    await loadRepo(result.path);
    hideSplash();
    toast(`Opened ${getRepoSummary(result.path)?.name || submodulePath}`, 'success');
  } catch (error) {
    toast(errorText(error), 'warn');
  }
}

function revealSubmodulePath(submodulePath: string): void {
  if (!state.repo || !submodulePath) return;
  void api.revealPath(state.repo.path, submodulePath).catch((error: unknown) => toast(errorText(error), 'warn'));
}

/* ============================================================
   Statistics
   ============================================================ */
let statisticsSeq = 0;

function languageStatInfo(ext: string): { name: string; color: string } {
  if (!ext || ext === 'text') return { name: 'Text', color: '#8b9ab0' };
  return LANGUAGE_BY_EXT[ext] || { name: ext.toUpperCase(), color: '#8b9ab0' };
}

function mergedStatisticsLanguages(statistics: RepoStatistics): { info: { name: string; color: string }; files: number; bytes: number }[] {
  const map = new Map<string, { info: { name: string; color: string }; files: number; bytes: number }>();
  for (const language of statistics.files.languages) {
    const info = languageStatInfo(language.ext);
    const entry = map.get(info.name) || { info, files: 0, bytes: 0 };
    entry.files += language.files;
    entry.bytes += language.bytes;
    map.set(info.name, entry);
  }
  return [...map.values()].sort((a, b) => b.bytes - a.bytes);
}

function statisticsGeneratedLabel(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString(isChinese() ? 'zh-CN' : [], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

async function loadStatistics(repoPath: string, { silent = false }: { silent?: boolean } = {}): Promise<void> {
  if (!repoPath) return;
  const requestId = ++statisticsSeq;
  state.statisticsLoading = true;
  if (!silent) renderStatistics();
  try {
    const statistics = await api.getStatistics(repoPath);
    if (requestId !== statisticsSeq || state.repo?.path !== repoPath) return;
    state.statistics = statistics;
    state.statisticsError = null;
  } catch (error) {
    if (requestId !== statisticsSeq || state.repo?.path !== repoPath) return;
    state.statistics = null;
    state.statisticsError = errorText(error);
  } finally {
    if (requestId === statisticsSeq) {
      state.statisticsLoading = false;
      renderStatistics();
    }
  }
}

function statisticsLanguageRows(statistics: RepoStatistics): string {
  const languages = mergedStatisticsLanguages(statistics);
  if (!languages.length) {
    return '<div class="stats-empty-line">No tracked files</div>';
  }
  const total = statistics.files.bytes || 1;
  return languages.map(({ info, bytes }) => {
    const pct = Math.max(1, Math.round((bytes / total) * 100));
    return `<div class="lang-row">
      <span class="lang-name">${esc(info.name)}</span>
      <span class="lang-track"><span class="lang-fill" style="width:${pct}%;--lang-color:${info.color}"></span></span>
      <span class="lang-value">${pct}% · ${fmtBytes(bytes)}</span>
    </div>`;
  }).join('');
}

function statisticsActivityHTML(statistics: RepoStatistics): string {
  const max = Math.max(1, ...statistics.commits.activity.map((bucket) => bucket.count));
  return `<div class="stats-activity">${statistics.commits.activity.map((bucket) => `
    <div class="activity-col" title="${esc(bucket.label)} · ${bucket.count}">
      <span class="activity-count">${bucket.count || ''}</span>
      <span class="activity-bar" style="height:${Math.max(2, Math.round((bucket.count / max) * 78))}px"></span>
      <span class="activity-label">${esc(bucket.label)}</span>
    </div>`).join('')}</div>`;
}

function statisticsFactsHTML(statistics: RepoStatistics): string {
  const facts: [string, string][] = [
    ['Branch', statistics.repo.branch],
    ['HEAD', statistics.repo.head || '—'],
    ['Upstream', statistics.repo.upstream || 'no upstream'],
    ['Ahead / behind', `${statistics.repo.ahead} / ${statistics.repo.behind}`],
    ['Remotes', String(statistics.repo.remotes)],
    ['Worktrees', String(statistics.repo.worktrees)],
    ['Submodules', String(statistics.repo.submodules)],
    ['Stashes', String(statistics.repo.stashes)],
    ['Branches', `${statistics.repo.localBranches} local · ${statistics.repo.remoteBranches} remote`],
    ['Tags', String(statistics.repo.tags)],
    ['First commit', statistics.commits.firstWhen || '—'],
    ['Last commit', statistics.commits.lastWhen || '—'],
    ['Object store', fmtBytes(statistics.objectStoreBytes)],
    ['Last fetch', timeAgo(statistics.repo.lastFetch)]
  ];
  return `<div class="stats-facts">${facts.map(([key, value]) => `
    <div class="stat-fact"><span class="k">${esc(key)}</span><span class="v" title="${esc(value)}">${esc(value)}</span></div>`).join('')}</div>`;
}

function statisticsWorkingTreeHTML(statistics: RepoStatistics): string {
  const tree = statistics.workingTree;
  const facts: [string, string][] = [
    ['Changes', String(tree.changes)],
    ['Staged', String(tree.staged)],
    ['Unstaged', String(tree.unstaged)],
    ['Lines', `+${tree.add} −${tree.del}`],
    ['Status', tree.changes ? 'uncommitted work' : 'clean']
  ];
  return `<div class="stats-facts">${facts.map(([key, value]) => `
    <div class="stat-fact"><span class="k">${esc(key)}</span><span class="v">${esc(value)}</span></div>`).join('')}</div>`;
}

function statisticsContributorsHTML(statistics: RepoStatistics): string {
  if (!statistics.contributors.length) return '<div class="stats-empty-line">No contributors yet</div>';
  return `<div class="contrib-list">${statistics.contributors.map((contributor) => `
    <div class="contrib-row">
      ${avatarHTML(contributor.name, 'avatar-xs')}
      <div class="contrib-main">
        <span class="contrib-name">${esc(contributor.name)}</span>
        <span class="contrib-email">${esc(contributor.email)}</span>
      </div>
      <span class="contrib-count">${plural(contributor.commits, 'commit')}</span>
    </div>`).join('')}</div>`;
}

function renderStatistics(): void {
  const body = $('#statisticsBody');
  const summary = $('#statsSummary');
  if (!body) return;
  const repo = state.repo;
  const statistics = state.statistics;

  if (summary) {
    if (!repo) summary.textContent = '';
    else if (state.statisticsLoading && !statistics) summary.textContent = 'Loading statistics…';
    else if (state.statisticsError) summary.textContent = 'Statistics could not be loaded';
    else if (statistics) summary.textContent = `${statistics.repo.branch} · updated ${statisticsGeneratedLabel(statistics.generatedAt)}`;
    else summary.textContent = 'Open this tab to load repository statistics.';
  }

  updateStatisticsBadge();
  const refresh = $<HTMLButtonElement>('[data-action="refresh-statistics"]');
  if (refresh) refresh.disabled = state.statisticsLoading;
  const download = $<HTMLButtonElement>('[data-action="download-statistics"]');
  if (download) {
    download.disabled = !statistics || state.statisticsDownloading;
    download.innerHTML = `${icon('download', state.statisticsDownloading ? 'spin' : '')}<span>${state.statisticsDownloading ? 'Preparing…' : 'Download'}</span>`;
  }

  if (!repo) {
    body.innerHTML = '';
    return;
  }

  if (state.statisticsLoading && !statistics) {
    body.innerHTML = '<div class="stats-loading"><span class="spinner"></span><span>Loading statistics…</span></div>';
    return;
  }

  if (state.statisticsError) {
    body.innerHTML = `<div class="empty-list stats-empty">
      <span class="e-icon">${icon('alert')}</span>
      <h4>Statistics unavailable</h4>
      <p>${esc(state.statisticsError)}</p>
      <button class="btn ghost sm" data-action="refresh-statistics">${icon('refresh')}Try again</button>
    </div>`;
    return;
  }

  if (!statistics) {
    body.innerHTML = '';
    return;
  }

  const cards: [string, string, string][] = [
    ['Commits', String(statistics.commits.total), statistics.commits.lastWhen ? `last ${statistics.commits.lastWhen}` : 'no commits yet'],
    ['Contributors', String(statistics.commits.contributors), 'across the current branch'],
    ['Tracked files', String(statistics.files.tracked), fmtBytes(statistics.files.bytes)],
    ['Tracked size', fmtBytes(statistics.files.bytes), `${plural(mergedStatisticsLanguages(statistics).length, 'language')}`],
    ['Branches', String(statistics.repo.localBranches + statistics.repo.remoteBranches), `${statistics.repo.localBranches} local · ${statistics.repo.remoteBranches} remote`],
    ['Tags', String(statistics.repo.tags), statistics.repo.stashes ? `${pluralStash(statistics.repo.stashes)} saved` : 'no stashes']
  ];

  body.innerHTML = `
    <div class="stats-grid">${cards.map(([label, value, sub]) => `
      <div class="stat-card">
        <span class="stat-label">${esc(label)}</span>
        <span class="stat-value">${esc(value)}</span>
        <span class="stat-sub">${esc(sub)}</span>
      </div>`).join('')}</div>
    <div class="stats-panels">
      <div class="stats-card">
        <h3>Languages <span class="muted">${fmtBytes(statistics.files.bytes)}</span></h3>
        <div class="lang-list">${statisticsLanguageRows(statistics)}</div>
      </div>
      <div class="stats-card">
        <h3>Commit activity <span class="muted">last 12 weeks</span></h3>
        ${statisticsActivityHTML(statistics)}
      </div>
    </div>
    <div class="stats-panels">
      <div class="stats-card">
        <h3>Repository</h3>
        ${statisticsFactsHTML(statistics)}
      </div>
      <div class="stats-card">
        <h3>Working tree</h3>
        ${statisticsWorkingTreeHTML(statistics)}
      </div>
    </div>
    <div class="stats-panels stats-panels-single">
      <div class="stats-card">
        <h3>Contributors <span class="muted">${plural(statistics.commits.contributors, 'contributor')}</span></h3>
        ${statisticsContributorsHTML(statistics)}
      </div>
    </div>`;
}

function buildStatisticsReportHTML(statistics: RepoStatistics): string {
  const zh = isChinese();
  const L = (en: string, cn: string): string => (zh ? cn : en);
  const generated = new Date(statistics.generatedAt).toLocaleString(zh ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  const totalBytes = statistics.files.bytes || 1;
  const languages = mergedStatisticsLanguages(statistics).map(({ info, bytes }) => {
    const pct = Math.max(1, Math.round((bytes / totalBytes) * 100));
    return `<div class="lang-row">
      <span class="lang-name">${esc(info.name)}</span>
      <span class="lang-track"><span class="lang-fill" style="width:${pct}%;background:${info.color}"></span></span>
      <span class="lang-value">${pct}% · ${fmtBytes(bytes)}</span>
    </div>`;
  }).join('');
  const activityMax = Math.max(1, ...statistics.commits.activity.map((bucket) => bucket.count));
  const activity = statistics.commits.activity.map((bucket) => `
    <div class="activity-col">
      <span class="activity-count">${bucket.count || ''}</span>
      <span class="activity-bar" style="height:${Math.max(3, Math.round((bucket.count / activityMax) * 90))}px"></span>
      <span class="activity-label">${esc(bucket.label)}</span>
    </div>`).join('');
  const contributors = statistics.contributors.map((contributor) => `
    <tr><td>${esc(contributor.name)}</td><td class="mono">${esc(contributor.email)}</td><td class="num">${contributor.commits}</td></tr>`).join('');
  const facts: [string, string][] = [
    [L('Branch', '分支'), statistics.repo.branch],
    ['HEAD', statistics.repo.head || '—'],
    [L('Upstream', '上游'), statistics.repo.upstream || L('no upstream', '无上游')],
    [L('Ahead / behind', '领先 / 落后'), `${statistics.repo.ahead} / ${statistics.repo.behind}`],
    [L('Remotes', '远程'), String(statistics.repo.remotes)],
    [L('Worktrees', '工作树'), String(statistics.repo.worktrees)],
    [L('Submodules', '子模块'), String(statistics.repo.submodules)],
    [L('Stashes', '贮藏'), String(statistics.repo.stashes)],
    [L('Branches', '分支数'), `${statistics.repo.localBranches} ${L('local', '本地')} · ${statistics.repo.remoteBranches} ${L('remote', '远程')}`],
    [L('Tags', '标签'), String(statistics.repo.tags)],
    [L('First commit', '首次提交'), statistics.commits.firstWhen || '—'],
    [L('Last commit', '最近提交'), statistics.commits.lastWhen || '—'],
    [L('Object store', '对象库'), fmtBytes(statistics.objectStoreBytes)],
    [L('Last fetch', '最近获取'), timeAgo(statistics.repo.lastFetch)]
  ];
  const cards: [string, string, string][] = [
    [L('Commits', '提交'), String(statistics.commits.total), statistics.commits.lastWhen ? `${L('last', '最近')} ${statistics.commits.lastWhen}` : ''],
    [L('Contributors', '贡献者'), String(statistics.commits.contributors), ''],
    [L('Tracked files', '已跟踪文件'), String(statistics.files.tracked), fmtBytes(statistics.files.bytes)],
    [L('Tracked size', '已跟踪大小'), fmtBytes(statistics.files.bytes), ''],
    [L('Branches', '分支'), String(statistics.repo.localBranches + statistics.repo.remoteBranches), `${statistics.repo.localBranches} ${L('local', '本地')} · ${statistics.repo.remoteBranches} ${L('remote', '远程')}`],
    [L('Tags', '标签'), String(statistics.repo.tags), '']
  ];
  return `<!DOCTYPE html>
<html lang="${zh ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(statistics.repo.name)} — ${L('Repository statistics', '仓库统计')}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 20px 48px; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f6fb; color: #182033; }
  .wrap { max-width: 1000px; margin: 0 auto; }
  header { padding: 26px 28px; border-radius: 16px; color: #fff; background: linear-gradient(120deg, #3d5afe, #7c4dff 55%, #b06bff); box-shadow: 0 18px 45px rgba(61, 90, 254, .22); }
  header h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: -.02em; }
  header p { margin: 0; opacity: .86; font-size: 13px; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 14px; font-size: 12px; opacity: .92; }
  .cards { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin: 18px 0; }
  .card { padding: 14px 16px; border-radius: 12px; background: #fff; border: 1px solid #e3e9f4; box-shadow: 0 4px 16px rgba(24, 32, 51, .04); }
  .card .label { font-size: 10px; font-weight: 700; letter-spacing: .11em; text-transform: uppercase; color: #7c879c; }
  .card .value { display: block; margin: 4px 0 2px; font-size: 24px; font-weight: 700; letter-spacing: -.03em; }
  .card .sub { font-size: 11px; color: #8792a6; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
  .panel { padding: 18px 20px; border-radius: 12px; background: #fff; border: 1px solid #e3e9f4; }
  .panel h2 { margin: 0 0 14px; font-size: 11px; letter-spacing: .13em; text-transform: uppercase; color: #6d7890; }
  .lang-row { display: grid; grid-template-columns: 110px 1fr 110px; gap: 10px; align-items: center; margin-bottom: 9px; font-size: 12px; }
  .lang-name { font-weight: 600; }
  .lang-track { height: 8px; border-radius: 4px; background: #edf1f8; overflow: hidden; }
  .lang-fill { display: block; height: 100%; border-radius: 4px; }
  .lang-value { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; color: #7c879c; text-align: right; }
  .activity { display: flex; align-items: flex-end; gap: 6px; height: 130px; }
  .activity-col { flex: 1; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 3px; }
  .activity-bar { width: 100%; max-width: 26px; border-radius: 4px 4px 0 0; background: linear-gradient(180deg, #5b7cfa, #a7b9ff); }
  .activity-count { font-size: 9px; color: #8b95a8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .activity-label { font-size: 8px; color: #9aa3b3; white-space: nowrap; }
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
  .fact .k { display: block; font-size: 9px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: #8b95a8; }
  .fact .v { display: block; margin-top: 2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; overflow-wrap: anywhere; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #edf1f8; }
  th { font-size: 9px; letter-spacing: .09em; text-transform: uppercase; color: #8b95a8; }
  td.num { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; color: #6d7890; }
  footer { margin-top: 22px; text-align: center; font-size: 11px; color: #8b95a8; }
  @media (max-width: 760px) { .cards { grid-template-columns: repeat(2, 1fr); } .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>${esc(statistics.repo.name)}</h1>
    <p>${L('Repository statistics report', '仓库统计报告')} · ${esc(generated)}</p>
    <div class="meta">
      <span>${L('Branch', '分支')}: ${esc(statistics.repo.branch)}</span>
      <span>HEAD: ${esc(statistics.repo.head || '—')}</span>
      <span>${esc(statistics.repo.path)}</span>
    </div>
  </header>
  <div class="cards">${cards.map(([label, value, sub]) => `
    <div class="card"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span><span class="sub">${esc(sub)}</span></div>`).join('')}</div>
  <div class="grid">
    <section class="panel"><h2>${L('Languages', '语言')}</h2>${languages || `<p>${L('No tracked files', '暂无已跟踪文件')}</p>`}</section>
    <section class="panel"><h2>${L('Commit activity · last 12 weeks', '提交活动 · 最近 12 周')}</h2><div class="activity">${activity}</div></section>
  </div>
  <div class="grid">
    <section class="panel"><h2>${L('Repository', '仓库')}</h2><div class="facts">${facts.map(([key, value]) => `<div class="fact"><span class="k">${esc(key)}</span><span class="v">${esc(value)}</span></div>`).join('')}</div></section>
    <section class="panel"><h2>${L('Working tree', '工作区')}</h2><div class="facts">
      <div class="fact"><span class="k">${L('Changes', '更改')}</span><span class="v">${statistics.workingTree.changes}</span></div>
      <div class="fact"><span class="k">${L('Staged', '已暂存')}</span><span class="v">${statistics.workingTree.staged}</span></div>
      <div class="fact"><span class="k">${L('Unstaged', '未暂存')}</span><span class="v">${statistics.workingTree.unstaged}</span></div>
      <div class="fact"><span class="k">${L('Lines', '行数')}</span><span class="v">+${statistics.workingTree.add} −${statistics.workingTree.del}</span></div>
    </div></section>
  </div>
  <section class="panel"><h2>${L('Contributors', '贡献者')}</h2>
    ${contributors ? `<table><thead><tr><th>${L('Name', '姓名')}</th><th>${L('Email', '邮箱')}</th><th class="num">${L('Commits', '提交')}</th></tr></thead><tbody>${contributors}</tbody></table>` : `<p>${L('No contributors yet', '暂无贡献者')}</p>`}
  </section>
  <footer>${L('Generated by GitGlance', '由 GitGlance 生成')} · ${esc(statistics.repo.path)}</footer>
</div>
</body>
</html>`;
}

async function downloadStatisticsReport(): Promise<void> {
  if (!state.repo || !state.statistics || state.statisticsDownloading) return;
  state.statisticsDownloading = true;
  renderStatistics();
  try {
    const result = await api.downloadStatistics(state.repo.path, buildStatisticsReportHTML(state.statistics));
    if (!result.canceled) toast(`Report saved to ${result.path || 'file'}`, 'success');
  } catch (error) {
    toast(errorText(error), 'warn');
  } finally {
    state.statisticsDownloading = false;
    renderStatistics();
  }
}

/* ============================================================
   Chat: welcome, messages and composer
   ============================================================ */
function chatWelcomeHTML(repo: RepoState | null): string {
  const files = repo?.files || [];
  const staged = files.filter((file) => file.staged).length;
  const context = files.length
    ? `I can see <strong>${plural(files.length, 'changed file')}</strong>${staged ? ` — ${staged} staged and ready to review` : ''}.`
    : 'Your working tree is clean, but I can still help with history, files, or commit messages.';
  return `<div class="chat-welcome">
    <span class="ai-orb lg">${icon('sparkles')}</span>
    <h3>How can I help with ${esc(repo?.name || 'this repository')}?</h3>
    <p>${context} Chat with the Pi agent about your worktree, code, or a commit message.</p>
    ${state.pi.available ? '' : `<div class="chat-empty-error">Pi agent is unavailable. ${esc(state.pi.error || '')}</div>`}
    <div class="chat-suggestions">
      <button type="button" class="chat-suggestion" data-chat-prompt="Summarize my changes" data-chat-prompt-zh="总结我的更改">
        ${icon('file-code')}<span class="s-label">Summarize my changes</span>${icon('chevron-right', 's-arrow')}
      </button>
      <button type="button" class="chat-suggestion" data-chat-prompt="Review my current changes" data-chat-prompt-zh="审阅当前更改">
        ${icon('search')}<span class="s-label">Review my current changes</span>${icon('chevron-right', 's-arrow')}
      </button>
      <button type="button" class="chat-suggestion" data-chat-prompt="Draft a commit message for my staged changes" data-chat-prompt-zh="为已暂存的更改起草提交信息">
        ${icon('git-commit')}<span class="s-label">Draft a commit message</span>${icon('chevron-right', 's-arrow')}
      </button>
    </div>
  </div>`;
}

function enhanceChatMarkdown(container: HTMLElement): void {
  const changed = new Set(state.repo?.files.map((file) => file.path) || []);
  const basenameList = state.repo?._basenameMap;
  container.querySelectorAll<HTMLElement>('code').forEach((code) => {
    if (code.closest<HTMLElement>('pre')) return;
    let text = (code.textContent || '').trim();
    if (!text) return;
    text = text.replace(/:\d+(?::\d+)?$/, '').replace(/^\.\//, '');
    let resolved: string | null = null;
    if (changed.has(text)) resolved = text;
    if (!resolved && basenameList?.has(text)) {
      const paths = basenameList.get(text)?.filter((path) => changed.has(path)) || [];
      if (paths.length === 1) resolved = paths[0] || null;
    }
    if (!resolved) return;
    code.dataset.chatFile = resolved;
    code.classList.add('chat-file-ref');
    code.title = resolved;
  });
  container.querySelectorAll('a[href]').forEach((link) => {
    link.setAttribute('rel', 'noreferrer');
  });
}

function markdownHTML(text: string): string {
  const raw = marked.parse(text || '', { async: false });
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

function finalizeAssistantMarkdown(bubble: HTMLElement, text: string): void {
  bubble.classList.remove('chat-streaming', 'is-live');
  bubble.classList.add('md');
  bubble.innerHTML = markdownHTML(text);
  bubble.querySelectorAll<HTMLElement>('pre code').forEach((block) => {
    try { hljs.highlightElement(block); } catch { /* ignore */ }
  });
  enhanceChatMarkdown(bubble);
}

function chatMessageHTML(message: ChatMessage): string {
  if (message.role === 'user') {
    return `<div class="chat-msg user">
      ${avatarHTML(state.currentUser.name)}
      <div class="chat-msg-body">
        <div class="chat-msg-head"><span class="who">${esc(state.currentUser.name)}</span><span>${esc(message.time)}</span></div>
        <div class="chat-bubble">${esc(message.text)}</div>
      </div>
    </div>`;
  }
  const isError = !!message.error;
  const showTyping = message.streaming && !message.text && !message.tool;
  const toolRow = message.tool
    ? `<div class="chat-tool-row"><span class="tool-dot"></span>${icon('terminal')}Using ${esc(message.tool)}…</div>`
    : '';
  let bubble: string;
  if (isError) {
    bubble = `<div class="chat-bubble">${esc(message.error)}</div>`;
  } else if (message.streaming) {
    bubble = `<div class="chat-bubble"><div class="chat-streaming is-live">${esc(message.text || '')}</div>${showTyping ? `<span class="typing-dots"><i></i><i></i><i></i></span>` : ''}</div>`;
  } else {
    bubble = `<div class="chat-bubble md">${message._rendered || markdownHTML(message.text || '')}</div>`;
    if (!message.text) bubble = `<div class="chat-bubble">${message.aborted ? 'Stopped.' : 'No response.'}</div>`;
  }
  return `<div class="chat-msg assistant${isError ? ' is-error' : ''}">
    <span class="chat-avatar-ai">${icon('sparkles')}</span>
    <div class="chat-msg-body">
      <div class="chat-msg-head"><span class="who">GitGlance AI</span><span>${esc(message.time)}</span></div>
      ${toolRow}
      ${bubble}
    </div>
  </div>`;
}

function renderChatThread({ forceBottom = false }: { forceBottom?: boolean } = {}): void {
  if (!state.repo) return;
  const chat = getChat(state.repo.path);
  const thread = $('#chatThread');
  if (!thread) return;
  const atBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 90;
  if (!chat.messages.length) {
    thread.innerHTML = chatWelcomeHTML(state.repo);
    thread.scrollTop = 0;
    return;
  }
  thread.innerHTML = chat.messages.map(chatMessageHTML).join('');
  thread.querySelectorAll<HTMLElement>('.chat-bubble.md').forEach((bubble) => {
    bubble.querySelectorAll<HTMLElement>('pre code').forEach((block) => {
      try { hljs.highlightElement(block); } catch { /* ignore */ }
    });
    enhanceChatMarkdown(bubble);
  });
  if (forceBottom || atBottom) thread.scrollTop = thread.scrollHeight;
}

function renderChatHead(): void {
  if (!state.repo) return;
  const repo = state.repo;
  const files = repo.files.length;
  const staged = repo.files.filter((file) => file.staged).length;
  const label = $('#chatContextLabel');
  if (label) {
    const status = state.pi.available ? 'Ready' : state.pi.binary ? 'Pi not configured' : 'Pi offline';
    label.innerHTML = `<span class="status-dot${state.pi.available ? '' : ' is-off'}"></span>${status} · ${esc(repo.name)} · ${plural(files, 'change')}`;
  }
  const row = $('#chatContextRow');
  if (row) {
    const prompts = state.settings.customPrompts || [];
    row.innerHTML = `
      <span class="chat-context-chip">${icon('branch')}${esc(repo.branch)}</span>
      <span class="chat-context-chip">${icon('git-commit')}${files} changed</span>
      <span class="chat-context-chip">${icon('check')}${staged} staged</span>` + prompts.map((prompt, index) => {
      const title = prompt.title || customPromptTitle(prompt.prompt);
      return `<button type="button" class="chat-context-chip chat-prompt-chip" data-custom-prompt="${index}" title="${esc(prompt.prompt)}">${icon('sparkles')}<span class="chat-prompt-chip-label">${esc(title)}</span></button>`;
    }).join('');
  }
  const input = $<HTMLTextAreaElement>('#chatInput');
  if (input) input.placeholder = `Ask about ${repo.name}…`;
}

function sendCustomPrompt(index: number): void {
  if (!state.repo) return;
  const entry = (state.settings.customPrompts || [])[index];
  const prompt = entry?.prompt;
  if (!prompt) return;
  const input = $<HTMLTextAreaElement>('#chatInput');
  if (input) {
    input.value = prompt;
    const chat = getChat(state.repo.path);
    chat.draft = prompt;
    chat.historyIndex = null;
    resizeChatInput();
    input.focus();
  }
  sendChatMessage(prompt);
}

function syncChatInput(force = false): void {
  if (!state.repo) return;
  const chat = getChat(state.repo.path);
  const input = $<HTMLTextAreaElement>('#chatInput');
  if (!input) return;
  if (force || document.activeElement !== input) input.value = chat.draft || '';
  input.placeholder = `Ask about ${state.repo.name}…`;
  resizeChatInput();
  syncChatComposer();
}

function resizeChatInput(): void {
  const input = $<HTMLTextAreaElement>('#chatInput');
  if (!input || !input.offsetParent) return;
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 92)}px`;
}

function syncChatComposer(): void {
  if (!state.repo) return;
  const chat = getChat(state.repo.path);
  const input = $<HTMLTextAreaElement>('#chatInput');
  const send = $<HTMLButtonElement>('#chatSend');
  if (!input || !send) return;
  const streaming = chat.streaming;
  send.disabled = streaming ? chat.stopping : (!state.pi.available || !input.value.trim());
  send.classList.toggle('is-stop', streaming);
  send.title = streaming ? 'Stop response' : 'Send message';
  send.innerHTML = streaming ? icon('stop') : icon('send');
}

function renderChat(): void {
  if (!state.repo) return;
  renderChatHead();
  renderChatThread();
  renderChatHistory();
  renderChatSide();
  syncChatInput();
}

function scheduleChatRender(): void {
  if (state.chatRenderQueued) return;
  const repoPath = state.repo?.path;
  if (!repoPath) return;
  state.chatRenderQueued = true;
  requestAnimationFrame(() => {
    state.chatRenderQueued = false;
    if (!state.repo || state.repo.path !== repoPath) return;
    if (state.activeTab !== 'chat') return;
    renderChatThread();
    syncChatComposer();
  });
}

function handlePiEvent(event: PiEvent): void {
  if (!event?.repoPath) return;
  const repoPath = event.repoPath;
  if (!state.repos.some((repo) => repo.path === repoPath) && state.repo?.path !== repoPath) return;
  const chat = getChat(repoPath);
  const active = state.repo?.path === repoPath && state.activeTab === 'chat';

  if (event.type === 'start') {
    chat.streaming = true;
    let assistant = [...chat.messages].reverse().find((message) => message.role === 'assistant' && message.streaming);
    if (!assistant) {
      assistant = createAssistantMessage();
      chat.messages.push(assistant);
    }
    if (active) { renderChatThread({ forceBottom: true }); syncChatComposer(); }
    return;
  }

  if (event.type === 'delta') {
    chat.streaming = true;
    let assistant = [...chat.messages].reverse().find((message) => message.role === 'assistant' && message.streaming);
    if (!assistant) {
      assistant = createAssistantMessage();
      chat.messages.push(assistant);
    }
    assistant.text += event.delta || '';
    chat.streamText += event.delta || '';
    if (active) scheduleChatRender();
    return;
  }

  if (event.type === 'tool') {
    let assistant = [...chat.messages].reverse().find((message) => message.role === 'assistant' && message.streaming);
    if (!assistant) {
      assistant = createAssistantMessage();
      chat.messages.push(assistant);
    }
    assistant.tool = event.toolName || 'tool';
    chat.tool = assistant.tool ?? null;
    if (active) scheduleChatRender();
    return;
  }

  if (event.type === 'tool_done') {
    const assistant = [...chat.messages].reverse().find((message) => message.role === 'assistant' && message.streaming);
    if (assistant) assistant.tool = null;
    chat.tool = null;
    if (active) scheduleChatRender();
    return;
  }

  if (event.type === 'status') {
    if (active && event.message) {
      const assistant = [...chat.messages].reverse().find((message) => message.role === 'assistant' && message.streaming);
      if (assistant) assistant.tool = event.message;
      scheduleChatRender();
    }
    return;
  }

  if (event.type === 'done') {
    chat.streaming = false;
    chat.stopping = false;
    const assistant = [...chat.messages].reverse().find((message) => message.role === 'assistant');
    if (assistant) {
      assistant.text = (event.text && event.text.trim()) || assistant.text || '';
      assistant.streaming = false;
      assistant.tool = null;
      assistant.aborted = !!event.aborted;
      if (!assistant.text) assistant.text = event.aborted ? '' : assistant.text;
      assistant._rendered = null;
    }
    if (event.aborted && assistant && !assistant.text) assistant.text = '';
    if (active) {
      renderChatThread({ forceBottom: true });
      syncChatComposer();
    }
    return;
  }

  if (event.type === 'error') {
    chat.error = event.message || 'Pi agent error';
    const assistant = [...chat.messages].reverse().find((message) => message.role === 'assistant' && message.streaming);
    if (assistant) {
      assistant.error = chat.error;
      assistant.streaming = false;
    }
    chat.streaming = false;
    chat.stopping = false;
    if (active) {
      renderChatThread({ forceBottom: true });
      syncChatComposer();
    }
  }
}

function sendChatMessage(rawText: unknown): void {
  if (!state.repo) return;
  const text = String(rawText || '').trim();
  if (!text) return;
  if (!state.pi.available) {
    toast(state.pi.error ? `Pi agent is unavailable. ${state.pi.error}` : 'Pi agent is unavailable. Install pi or set PI_BIN.', 'warn');
    return;
  }
  const chat = getChat(state.repo.path);
  if (chat.streaming) return;
  chat.messages.push(createUserMessage(text));
  chat.messages.push(createAssistantMessage());
  chat.streaming = true;
  chat.stopping = false;
  chat.streamText = '';
  chat.error = null;
  chat.tool = null;
  chat.draft = '';
  chat.historyIndex = null;
  const input = $<HTMLTextAreaElement>('#chatInput');
  if (input) {
    input.value = '';
    resizeChatInput();
    input.focus();
  }
  renderChatThread({ forceBottom: true });
  syncChatComposer();
  void api.pi.send(state.repo.path, text, state.chatSelectedFile || null).catch((error: unknown) => {
    chat.streaming = false;
    chat.stopping = false;
    const assistant = [...chat.messages].reverse().find((message) => message.role === 'assistant');
    if (assistant) {
      assistant.streaming = false;
      assistant.error = errorText(error);
    }
    chat.error = errorText(error);
    renderChatThread({ forceBottom: true });
    syncChatComposer();
  });
}

function navigateChatHistory(direction: -1 | 1, input: HTMLTextAreaElement): boolean {
  if (!state.repo) return false;
  const chat = getChat(state.repo.path);
  const history = chat.messages
    .filter((message) => message.role === 'user')
    .map((message) => message.text);
  if (!history.length) return false;
  if (chat.historyIndex == null && direction > 0) return false;
  const index = chat.historyIndex == null ? history.length + direction : chat.historyIndex + direction;
  if (index < 0 || index >= history.length) return false;
  chat.historyIndex = index;
  input.value = history[index];
  chat.draft = input.value;
  resizeChatInput();
  syncChatComposer();
  const end = input.value.length;
  input.setSelectionRange(end, end);
  return true;
}

function stopChat(): void {
  if (!state.repo) return;
  const chat = getChat(state.repo.path);
  if (!chat.streaming) return;
  chat.stopping = true;
  syncChatComposer();
  void api.pi.abort(state.repo.path).catch(() => {});
}

function resetChat(): void {
  if (!state.repo) return;
  const chat = getChat(state.repo.path);
  if (chat.streaming) void api.pi.abort(state.repo.path).catch(() => {});
  void api.pi.reset(state.repo.path).catch(() => {});
  chat.messages = [];
  chat.streaming = false;
  chat.stopping = false;
  chat.streamText = '';
  chat.draft = '';
  chat.historyIndex = null;
  chat.error = null;
  chat.tool = null;
  const input = $<HTMLTextAreaElement>('#chatInput');
  if (input) {
    input.value = '';
    resizeChatInput();
    input.focus();
  }
  renderChatThread();
  syncChatComposer();
}

/* ============================================================
   Chat side: changed files + selected preview
   ============================================================ */
function chatTreeNodes(nodes: RepoTreeNode[], depth = 0): string {
  return nodes.map((node) => {
    if (node.type === 'folder') {
      const open = !state.chatTreeCollapsed.has(node.path);
      const badge = node.changed
        ? `<span class="folder-change${node.staged === node.changed ? ' all-staged' : ''}" title="${plural(node.changed, 'changed file')} · ${node.staged} staged"><i></i>${node.changed}</span>`
        : '';
      return `<div class="tree-row folder" data-chat-folder="${esc(node.path)}" style="--depth:${depth}" title="${esc(node.path)}">
        ${icon('chevron-right', `caret${open ? ' open' : ''}`)}
        ${icon('folder', 'folder-ico')}
        <span class="tree-label">${esc(node.name)}</span>
        ${badge}
      </div>` + (open ? chatTreeNodes(node.children, depth + 1) : '');
    }
    const change = node.change;
    if (!change) return '';
    const selected = state.chatPreviewOpen && state.chatSelectedFile === node.path;
    const [base, ext] = splitFileExt(node.name);
    const stats = change.binary
      ? '<span class="diff-del">binary</span>'
      : `${change.add ? `<span class="diff-add">+${change.add}</span>` : ''}${change.del ? `<span class="diff-del">−${change.del}</span>` : ''}`;
    return `<div class="tree-row file${selected ? ' is-selected' : ''}" data-chat-file="${esc(node.path)}" data-kind="file" style="--depth:${depth}" title="${esc(node.path)} — click to preview">
      <button class="stage-check${change.staged ? ' checked' : ''}" data-stage="${esc(node.path)}" aria-pressed="${change.staged}" aria-label="${change.staged ? 'Unstage' : 'Stage'} ${esc(node.path)}" title="${change.staged ? 'Unstage file' : 'Stage file'}">${icon('check')}</button>
      <span class="status-badge status-${change.status}${change.staged ? ' is-staged' : ''}" title="${statusName(change.status)}${change.staged ? ' · staged' : ''}">${change.status}</span>
      <span class="tree-label">${esc(base)}<span class="ext">${esc(ext)}</span></span>
      <span class="file-diff">${stats}</span>
    </div>`;
  }).join('');
}

/* ============================================================
   Chat history paging
   ============================================================ */
let historySeq = 0;
let historyScrollGuardUntil = 0;

function guardHistoryScroll(): void {
  historyScrollGuardUntil = performance.now() + 150;
}

function resetChatHistoryPaging(): void {
  historySeq += 1;
  state.historyLoading = false;
  state.historyError = null;
}

function historyTotal(repo: RepoState): number {
  return Math.max(repo.historyTotal || 0, repo.history.length);
}

function updateChatHistorySub(): void {
  const repo = state.repo;
  const sub = $('#chatHistorySub');
  if (!repo || !sub) return;
  const loaded = repo.history.length;
  const total = historyTotal(repo);
  sub.textContent = loaded < total
    ? `all refs · ${loaded} of ${plural(total, 'commit')}`
    : `all refs · ${plural(loaded, 'commit')}`;
}

function updateChatHistoryFooter(): void {
  const list = $('#chatHistoryList');
  if (!list) return;
  const repo = state.repo;
  const foot = $('#chatHistoryFoot');
  const exhausted = !repo || repo.history.length >= historyTotal(repo);
  if (!repo || !repo.history.length || (exhausted && !state.historyLoading && !state.historyError)) {
    foot?.remove();
    return;
  }
  let html = '';
  if (state.historyLoading) {
    html = '<span class="spinner" aria-hidden="true"></span><span>Loading older commits…</span>';
  } else if (state.historyError) {
    html = '<span>Could not load older commits.</span><button class="chat-history-retry" data-action="retry-history">Retry</button>';
  }
  if (!html) {
    foot?.remove();
    return;
  }
  const element = foot || document.createElement('div');
  if (!foot) {
    element.id = 'chatHistoryFoot';
    element.className = 'chat-history-foot';
    list.appendChild(element);
  }
  guardHistoryScroll();
  element.innerHTML = html;
}

function maybeLoadOlderHistory(): void {
  if (state.activeTab !== 'chat') return;
  const list = $('#chatHistoryList');
  const repo = state.repo;
  if (!list || !repo) return;
  if (state.historyLoading || state.historyError) return;
  if (repo.history.length >= historyTotal(repo)) return;
  if (list.scrollTop + list.clientHeight < list.scrollHeight - 160) return;
  void loadOlderHistory();
}

async function loadOlderHistory(): Promise<void> {
  const repo = state.repo;
  if (!repo || state.historyLoading || state.historyError) return;
  const loaded = repo.history.length;
  if (loaded >= historyTotal(repo)) return;
  const target = repo.path;
  const requestId = ++historySeq;
  state.historyLoading = true;
  updateChatHistoryFooter();
  try {
    const page = await api.getHistoryPage(target, loaded);
    if (requestId !== historySeq || state.repo?.path !== target) return;
    const known = new Set(repo.history.map((commit) => commit.sha));
    const fresh = page.filter((commit) => !known.has(commit.sha));
    if (!fresh.length) {
      repo.historyTotal = repo.history.length;
      updateChatHistorySub();
      return;
    }
    const start = repo.history.length;
    repo.history = repo.history.concat(fresh);
    const rows = computeGraph(repo.history);
    const remoteNames = state.remotes.map((remote) => remote.name);
    const list = $('#chatHistoryList');
    if (list) {
      guardHistoryScroll();
      $('#chatHistoryFoot')?.remove();
      list.insertAdjacentHTML('beforeend', fresh
        .map((commit, index) => chatHistoryRowHTML(commit, start + index, rows, repo, remoteNames))
        .join(''));
    }
    updateChatHistorySub();
  } catch (error) {
    if (requestId !== historySeq || state.repo?.path !== target) return;
    state.historyError = errorText(error);
  } finally {
    if (requestId === historySeq && state.repo?.path === target) {
      state.historyLoading = false;
      updateChatHistoryFooter();
    }
  }
  maybeLoadOlderHistory();
}

function chatHistoryRowHTML(commit: GitCommit, index: number, rows: GraphRow[], repo: RepoState, remoteNames: string[]): string {
  const isHead = !!repo.headSha && (commit.sha === repo.headSha || commit.sha.startsWith(repo.headSha));
  const refs = (commit.refs || [])
    .filter((ref) => !remoteNames.some((name) => ref.startsWith(`${name}/`)) && !ref.endsWith('/HEAD'))
    .slice(0, 2)
    .map(refPill)
    .join('');
  const stats = commit.stats && (commit.stats[0] || commit.stats[1])
    ? `<span class="chat-history-stats"><span class="diff-add">+${commit.stats[0]}</span><span class="diff-del">−${commit.stats[1]}</span></span>`
    : '';
  const isRoot = commit.parents.length === 0;
  return `<div class="chat-history-row${isHead ? ' is-head' : ''}" data-commit-sha="${esc(commit.sha)}" data-commit-short="${esc((commit.sha || '').slice(0, 7))}" data-commit-message="${esc(commit.message)}" data-commit-root="${isRoot}" title="${esc(commit.message)}">
      <div class="chat-history-graph">${graphSVG(rows[index], isHead, commit)}</div>
      <div class="chat-history-main">
        <div class="chat-history-msg-line">
          ${refs ? `<span class="refs">${refs}</span>` : ''}
          <span class="chat-history-msg">${esc(commit.message)}</span>
        </div>
        <div class="chat-history-meta">
          <span class="chat-history-author">${esc(commit.author)}</span>
          <span>·</span>
          <span class="chat-history-when">${esc(commit.when)}</span>
          ${stats}
          <button class="chat-history-hash" data-copy-sha="${esc(commit.sha)}" title="Copy commit SHA">${esc((commit.sha || '').slice(0, 7))}</button>
        </div>
      </div>
    </div>`;
}

function renderChatHistory(): void {
  const repo = state.repo;
  const list = $('#chatHistoryList');
  if (!repo || !list) return;
  updateChatHistorySub();
  const commits = repo.history;
  if (!commits.length) {
    list.innerHTML = '<div class="chat-history-empty">No commits yet.</div>';
    updateChatHistoryFooter();
    return;
  }
  const rows = computeGraph(commits);
  const remoteNames = state.remotes.map((remote) => remote.name);
  const scrollTop = list.scrollTop;
  guardHistoryScroll();
  list.innerHTML = commits.map((commit, index) => chatHistoryRowHTML(commit, index, rows, repo, remoteNames)).join('');
  list.scrollTop = scrollTop;
  updateChatHistoryFooter();
  maybeLoadOlderHistory();
}

function commitContextFromRow(row: HTMLElement): CommitContext {
  const sha = row.dataset.commitSha || '';
  return {
    sha,
    short: row.dataset.commitShort || sha.slice(0, 7),
    message: row.dataset.commitMessage || '',
    root: row.dataset.commitRoot === 'true',
    branch: state.repo?.branch || 'HEAD'
  };
}

function openCommitMenu(row: HTMLElement, x: number, y: number): void {
  const commit = commitContextFromRow(row);
  contextCommit = commit;
  $$('.chat-history-row.is-context-target').forEach((element) => element.classList.remove('is-context-target'));
  row.classList.add('is-context-target');
  const menu = $('#commitMenu');
  if (!menu) return;
  menu.innerHTML = `
    <button class="context-menu-item" data-commit-action="new-branch">${icon('branch')}<span class="context-menu-label">New Branch</span></button>
    <button class="context-menu-item" data-commit-action="new-tag">${icon('tag')}<span class="context-menu-label">New Tag</span></button>
    <div class="context-menu-sep"></div>
    <button class="context-menu-item" data-commit-action="cherry-pick">${icon('git-commit')}<span class="context-menu-label">Cherry Pick Commit</span></button>
    <button class="context-menu-item" data-commit-action="revert">${icon('refresh')}<span class="context-menu-label">Revert Commit</span></button>
    <div class="context-menu-sep"></div>
    <button class="context-menu-item is-danger" data-commit-action="reset">${icon('alert')}<span class="context-menu-label">Reset ${esc(commit.branch)} to here</span></button>
    <button class="context-menu-item" data-commit-action="squash"${commit.root ? ' disabled title="The root commit has no parent"' : ''}>${icon('git-merge')}<span class="context-menu-label">Squash into parent</span></button>
    <div class="context-menu-sep"></div>
    <button class="context-menu-item" data-commit-action="copy-sha">${icon('copy')}<span class="context-menu-label">Copy Commit SHA</span></button>`;
  menu.hidden = false;
  menu.style.left = '0px';
  menu.style.top = '0px';
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
}

function closeCommitMenu(): void {
  const menu = $('#commitMenu');
  if (menu) {
    menu.hidden = true;
    menu.innerHTML = '';
  }
  $$('.chat-history-row.is-context-target').forEach((element) => element.classList.remove('is-context-target'));
  contextCommit = null;
}

function openCommitActionModal(type: 'branch' | 'tag' | 'reset', commit: CommitContext): void {
  commitAction = { type, ...commit, mode: 'mixed' };
  commitActionBusy = false;
  const title = $('#commitActionTitle');
  const subtitle = $('#commitActionSubtitle');
  const body = $('#commitActionBody');
  const confirm = $<HTMLButtonElement>('#commitActionConfirm');
  const iconWrap = $('#commitActionIcon');
  if (type === 'branch') {
    if (title) title.textContent = 'New Branch';
    if (subtitle) subtitle.textContent = `Create a branch at ${commit.short}`;
    if (iconWrap) iconWrap.innerHTML = icon('branch');
    if (body) body.innerHTML = `<div class="field">
      <span class="field-label">Branch name</span>
      <input class="input mono-input" id="commitActionInput" placeholder="new-branch-name" autocomplete="off" spellcheck="false" aria-label="Branch name">
    </div>
    <p class="commit-action-hint">The branch is created at ${esc(commit.short)} and is not checked out.</p>`;
    if (confirm) confirm.textContent = 'Create branch';
  } else if (type === 'tag') {
    if (title) title.textContent = 'New Tag';
    if (subtitle) subtitle.textContent = `Create a tag at ${commit.short}`;
    if (iconWrap) iconWrap.innerHTML = icon('tag');
    if (body) body.innerHTML = `<div class="field">
      <span class="field-label">Tag name</span>
      <input class="input mono-input" id="commitActionInput" placeholder="new-tag-name" autocomplete="off" spellcheck="false" aria-label="Tag name">
    </div>
    <p class="commit-action-hint">The tag points at ${esc(commit.short)}.</p>`;
    if (confirm) confirm.textContent = 'Create tag';
  } else {
    if (title) title.textContent = `Reset ${commit.branch} to ${commit.short}`;
    if (subtitle) subtitle.textContent = 'Move the current branch to this commit';
    if (iconWrap) iconWrap.innerHTML = icon('alert');
    if (body) body.innerHTML = `<div class="field">
      <span class="field-label">Reset type</span>
      <div class="reset-choices" id="resetModeChoices" role="radiogroup" aria-label="Reset type">
        <button type="button" class="reset-choice" data-reset-mode="soft" role="radio" aria-checked="false">
          <span class="reset-choice-name">Soft</span>
          <span class="reset-choice-desc">Move HEAD only; keep the index and working tree.</span>
        </button>
        <button type="button" class="reset-choice is-active" data-reset-mode="mixed" role="radio" aria-checked="true">
          <span class="reset-choice-name">Mixed</span>
          <span class="reset-choice-desc">Move HEAD and reset the index; keep the working tree.</span>
        </button>
        <button type="button" class="reset-choice" data-reset-mode="hard" role="radio" aria-checked="false">
          <span class="reset-choice-name">Hard</span>
          <span class="reset-choice-desc">Move HEAD and discard the index and working tree changes.</span>
        </button>
      </div>
    </div>`;
    if (confirm) confirm.textContent = 'Reset branch';
  }
  const backdrop = $<HTMLElement>('#commitActionBackdrop');
  backdrop?.classList.add('is-open');
  backdrop?.setAttribute('aria-hidden', 'false');
  if (confirm) confirm.disabled = false;
  setTimeout(() => {
    const input = $<HTMLInputElement>('#commitActionInput');
    if (input) input.focus({ preventScroll: true });
    else $<HTMLButtonElement>('.reset-choice.is-active')?.focus({ preventScroll: true });
  }, 80);
}

function closeCommitActionModal(): void {
  if (commitActionBusy) return;
  const backdrop = $<HTMLElement>('#commitActionBackdrop');
  backdrop?.classList.remove('is-open');
  backdrop?.setAttribute('aria-hidden', 'true');
  commitAction = null;
}

async function withCommitAction<T>(
  task: (repoPath: string) => Promise<T>,
  onSuccess: (result: T) => string
): Promise<boolean> {
  if (!state.repo || state.busyAction || commitActionBusy) return false;
  const repo = state.repo;
  commitActionBusy = true;
  state.busyAction = 'commit';
  renderSummary();
  const confirm = $<HTMLButtonElement>('#commitActionConfirm');
  if (confirm) confirm.disabled = true;
  let ok = false;
  try {
    const result = await task(repo.path);
    if (state.repo?.path === repo.path) {
      await refreshRepo({ silent: true });
      await refreshSummaries();
      toast(onSuccess(result), 'success');
    }
    ok = true;
  } catch (error) {
    toast(errorText(error), 'warn');
  } finally {
    commitActionBusy = false;
    if (confirm) confirm.disabled = false;
    if (state.busyAction === 'commit') state.busyAction = null;
    renderSummary();
  }
  return ok;
}

async function confirmCommitAction(): Promise<void> {
  if (!state.repo || !commitAction || commitActionBusy) return;
  const action = commitAction;
  if (action.type === 'branch' || action.type === 'tag') {
    const input = $<HTMLInputElement>('#commitActionInput');
    const name = input?.value.trim() || '';
    if (!name) {
      input?.focus();
      toast(action.type === 'branch' ? 'Enter a branch name' : 'Enter a tag name', 'warn');
      return;
    }
    const ok = await withCommitAction(
      (repoPath) => action.type === 'branch'
        ? api.createBranchAt(repoPath, name, action.sha)
        : api.createTagAt(repoPath, name, action.sha),
      () => action.type === 'branch'
        ? `Created branch '${name}' at ${action.short}`
        : `Created tag '${name}' at ${action.short}`
    );
    if (ok) closeCommitActionModal();
    return;
  }
  const active = $('#resetModeChoices .reset-choice.is-active');
  const mode = (active?.dataset.resetMode || 'mixed') as ResetMode;
  const ok = await withCommitAction(
    (repoPath) => api.resetToCommit(repoPath, action.sha, mode),
    () => `Reset ${action.branch} to ${action.short} (${mode})`
  );
  if (ok) closeCommitActionModal();
}

async function runCommitHistoryAction(action: 'cherry-pick' | 'revert' | 'squash', commit: CommitContext): Promise<void> {
  if (!state.repo) return;
  if (action === 'squash') {
    const confirmed = window.confirm(isChinese()
      ? '将此提交压缩到父提交？这会重写历史。'
      : 'Squash this commit into its parent? This rewrites history.');
    if (!confirmed) return;
  }
  await withCommitAction(
    (repoPath) => action === 'cherry-pick'
      ? api.cherryPickCommit(repoPath, commit.sha)
      : action === 'revert'
        ? api.revertCommit(repoPath, commit.sha)
        : api.squashCommit(repoPath, commit.sha),
    () => action === 'cherry-pick'
      ? `Cherry-picked ${commit.short}`
      : action === 'revert'
        ? `Reverted ${commit.short}`
        : `Squashed ${commit.short} into its parent`
  );
}

function renderChatSide(): void {
  if (!state.repo) return;
  const repo = state.repo;
  const files = repo.files;
  const staged = files.filter((file) => file.staged).length;
  const side = $('#chatSide');
  const head = $('#chatSideHead');
  const changes = $('#chatChanges');
  const panel = $('#chatPanel');
  if (!side || !head || !changes) return;
  panel?.classList.toggle('is-preview-closed', !state.chatPreviewOpen);
  const previousScroll = changes.scrollTop;
  const pct = files.length ? Math.round((staged / files.length) * 100) : 0;

  head.innerHTML = `<div class="csh-row">
    <div class="csh-title">${icon('folder')}<span class="eyebrow">Changed File Tree</span><span class="csh-count">${files.length}</span></div>
    <div class="csh-actions">
      <button class="csh-open" data-action="open-worktree" title="Open full worktree">${icon('folder')}Worktree</button>
    </div>
  </div>
  <div class="csh-meta"><span class="g-dot staged"></span>${staged} staged<span class="g-dot unstaged"></span>${files.length - staged} unstaged</div>
  <div class="chat-stage-bar"><i style="width:${pct}%"></i></div>`;

  side.classList.toggle('is-empty', files.length === 0);
  if (!files.length) {
    state.chatSelectedFile = null;
    state.chatPreviewOpen = false;
    panel?.classList.add('is-preview-closed');
    changes.innerHTML = `<div class="chat-side-empty">
      <span class="e-icon">${icon('check')}</span>
      <h4>Working tree clean</h4>
      <p>There are no staged or unstaged files in ${esc(repo.name)} right now.</p>
    </div>`;
    clearDetail('chat');
    return;
  }

  if (!state.chatSelectedFile || !files.some((file) => file.path === state.chatSelectedFile)) {
    state.chatSelectedFile = pickChatFile(repo);
    state.chatPaneMode = 'preview';
  }

  changes.innerHTML = chatTreeNodes(buildRepoTree(repoEntries(repo).filter((entry) => entry.change), false), 0);
  changes.scrollTop = previousScroll;
  if (state.chatPreviewOpen) {
    const selectedRow = changes.querySelector<HTMLElement>('.tree-row.file.is-selected');
    if (selectedRow) {
      const rowRect = selectedRow.getBoundingClientRect();
      const boxRect = changes.getBoundingClientRect();
      if (rowRect.top < boxRect.top) changes.scrollTop -= boxRect.top - rowRect.top;
      else if (rowRect.bottom > boxRect.bottom) changes.scrollTop += rowRect.bottom - boxRect.bottom;
    }
  }
  renderChatHead();

  if (state.activeTab === 'chat' && state.chatPreviewOpen) renderDetail('chat');
}

function hideChatPreview(): void {
  if (!state.chatPreviewOpen) return;
  state.chatPreviewOpen = false;
  renderChatSide();
}

function selectChatFile(filePath: string): void {
  if (!state.repo) return;
  if (!state.repo.files.some((file) => file.path === filePath)) {
    toast('That file is no longer part of the working tree', 'info');
    return;
  }
  state.chatSelectedFile = filePath;
  state.chatPaneMode = 'preview';
  state.chatPreviewOpen = true;
  for (const folder of ancestorsOf(filePath)) state.chatTreeCollapsed.delete(folder);
  renderChatSide();
}

/* ============================================================
   File detail shell & preview
   ============================================================ */
interface PreviewCallbacks {
  onOpen?: () => void;
  onReveal?: () => void;
  onInfo?: (info?: { label?: string }) => void;
}

interface DetailHandle {
  path: string | null;
  mode: PaneMode;
  container: HTMLElement | null;
}

function disposeDetail(scope: DetailScope): void {
  const detail = state.detail[scope];
  if (!detail) return;
  detail.token += 1;
  if (detail.cleanup) {
    try { detail.cleanup(); } catch { /* ignore */ }
    detail.cleanup = null;
  }
  detail.key = null;
}

function clearDetail(scope: DetailScope): void {
  disposeDetail(scope);
  const container = scope === 'main' ? $('#diffPane') : $('#chatDetail');
  if (container) container.innerHTML = '';
}

function detailActive(scope: DetailScope): boolean {
  return (scope === 'main' && state.activeTab === 'files') || (scope === 'chat' && state.activeTab === 'chat');
}

function detailStateFor(scope: DetailScope): DetailHandle {
  return {
    path: scope === 'main' ? state.selectedFile : state.chatSelectedFile,
    mode: scope === 'main' ? state.paneMode : state.chatPaneMode,
    container: scope === 'main' ? $('#diffPane') : $('#chatDetail')
  };
}

function canDiffEntry(entry: RepoEntry | null, change: GitStatusFile | null): boolean {
  if (!change || !entry || entry.kind === 'link') return false;
  return !NON_DIFF_EXTENSIONS.has(extensionOf(entry.path));
}

function previewLoaderText(filePath: string, mode: PaneMode): { main: string; sub: string } {
  if (mode === 'diff') return { main: 'Loading diff…', sub: 'Comparing this file with the index.' };
  const ext = extensionOf(filePath);
  if (OFFICE_EXTENSIONS.has(ext)) return { main: 'Converting document…', sub: 'LibreOffice is preparing a PDF preview.' };
  if (ext === 'pdf') return { main: 'Rendering PDF…', sub: 'Loading pages with PDF.js.' };
  if (IMAGE_EXTENSIONS.has(ext)) return { main: 'Loading image…', sub: '' };
  return { main: 'Loading file…', sub: '' };
}

function fileStatsHTML(change: GitStatusFile | null): string {
  if (!change) return '';
  if (change.binary) return '<span class="chip">binary</span>';
  return `<span class="diff-head-stats"><span class="diff-add">+${change.add || 0}</span><span class="diff-del">−${change.del || 0}</span></span>`;
}

function detailHeadHTML(entry: RepoEntry, change: GitStatusFile | null, showClose = false): string {
  const path = entry.path;
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  const isLink = entry.kind === 'link';
  let marker: string;
  if (isLink) marker = `<span class="chip">${icon('link')}symlink</span>`;
  else if (change) marker = `<span class="status-badge status-${change.status}${change.staged ? ' is-staged' : ''}" title="${statusName(change.status)}${change.staged ? ' · staged' : ''}">${change.status}</span>`;
  else marker = `<span class="clean-chip">${icon('check')}Clean</span>`;
  return `<div class="diff-head">
    ${icon(isLink ? 'link' : 'file-code')}
    <span class="diff-file" title="${esc(path)}">
      <span class="dir">${esc(dir)}</span><span class="base">${esc(base)}</span>
    </span>
    ${marker}
    ${fileStatsHTML(change)}
    <span class="diff-actions">
      <button class="icon-btn" data-copy-path="${esc(path)}" title="Copy file path" aria-label="Copy file path">${icon('copy')}</button>
      ${showClose ? `<button class="icon-btn" data-action="hide-chat-preview" title="Hide preview" aria-label="Hide preview">${icon('x')}</button>` : ''}
    </span>
  </div>`;
}

function linkDetailHTML(entry: RepoEntry, change: GitStatusFile | null, showClose = false): string {
  const path = entry.path;
  return `${detailHeadHTML(entry, change, showClose)}
    <div class="diff-meta">
      <span class="diff-mode">Symlink</span>
      <span class="meta-context">tracked symbolic link</span>
      <span class="diff-kind">target</span>
    </div>
    <div class="link-preview">
      <div class="link-card">
        <span class="link-icon">${icon('link')}</span>
        <h3>${esc(path.split('/').pop())}</h3>
        <div class="target">${esc(entry.target || 'unknown target')}</div>
        <p>This is a symbolic link tracked by Git. Use the target path below to reveal it.</p>
        <div class="preview-actions" style="justify-content:center">
          <button class="preview-tool-btn" data-copy-path="${esc(entry.target || '')}">${icon('copy')}Copy target</button>
        </div>
      </div>
    </div>`;
}

function detailShellHTML(entry: RepoEntry, change: GitStatusFile | null, mode: PaneMode, showClose = false): string {
  const canDiff = canDiffEntry(entry, change);
  const safeMode = mode === 'diff' && canDiff ? 'diff' : 'preview';
  const modeChip = change ? (change.staged ? 'Staged' : 'Working tree') : 'Clean';
  const context = safeMode === 'preview' ? 'current contents' : `compared to ${change?.staged ? 'HEAD' : 'index'}`;
  const kind = safeMode === 'preview' ? 'Loading preview…' : 'Loading diff…';
  const switchHTML = `<div class="pane-switch" role="group" aria-label="File view">
    <button type="button" data-pane-mode="preview" class="${safeMode === 'preview' ? 'is-active' : ''}" aria-pressed="${safeMode === 'preview'}">${icon('file-code')}Preview</button>
    <button type="button" data-pane-mode="diff" class="${safeMode === 'diff' ? 'is-active' : ''}" aria-pressed="${safeMode === 'diff'}"${canDiff ? '' : ' disabled title="No text diff available for this file"'}>${icon('git-commit')}Changes</button>
  </div>`;
  return `${detailHeadHTML(entry, change, showClose)}
    <div class="diff-meta">
      ${switchHTML}
      <span class="diff-mode">${modeChip}</span>
      <span class="meta-context">${context}</span>
      <span class="diff-kind" data-detail-kind>${esc(kind)}</span>
    </div>
    <div class="detail-body">
      <div class="preview-slot" data-preview-slot>
        <div class="preview-loading">
          <span class="spinner"></span>
          <span>Loading…</span>
        </div>
      </div>
    </div>`;
}

function renderDetail(scope: DetailScope, { force = false }: { force?: boolean } = {}): void {
  if (!state.repo || !detailActive(scope)) return;
  const repo = state.repo;
  const { path, mode, container } = detailStateFor(scope);
  if (!container) return;

  if (!path) {
    clearDetail(scope);
    container.innerHTML = `<div class="preview-empty">
      <span class="e-icon">${icon(scope === 'chat' ? 'git-commit' : 'file-code')}</span>
      <h3>${scope === 'chat' ? 'Select a changed file' : 'Select a file'}</h3>
      <p>${scope === 'chat' ? 'Choose a changed file above to preview its content or diff.' : 'Choose any file in the repository tree to preview its contents.'}</p>
    </div>`;
    return;
  }

  const entry: RepoEntry = entryForPath(path) || { path, kind: 'file', target: null, change: changeForPath(path) };
  const change = changeForPath(path);
  const canDiff = canDiffEntry(entry, change);
  const activeMode: PaneMode = mode === 'diff' && canDiff ? 'diff' : 'preview';
  if (activeMode !== mode) {
    if (scope === 'main') state.paneMode = activeMode;
    else state.chatPaneMode = activeMode;
  }

  const key = `${repo._version}|${path}|${activeMode}|${change?.staged || false}|${change?.status || 'clean'}`;
  const detail = state.detail[scope];
  if (!force && detail.key === key && container.firstElementChild) return;

  disposeDetail(scope);
  const token = state.detail[scope].token;
  state.detail[scope].key = key;

  if (entry.kind === 'link') {
    container.innerHTML = linkDetailHTML(entry, change, scope === 'chat');
    return;
  }

  container.innerHTML = detailShellHTML(entry, change, activeMode, scope === 'chat');
  const slot = container.querySelector<HTMLElement>('[data-preview-slot]');
  const kindEl = container.querySelector<HTMLElement>('[data-detail-kind]');
  const loader = previewLoaderText(path, activeMode);
  if (slot) {
    slot.innerHTML = `<div class="preview-loading"><span class="spinner"></span><span>${esc(loader.main)}</span>${loader.sub ? `<span class="sub">${esc(loader.sub)}</span>` : ''}</div>`;
  }

  const callbacks: PreviewCallbacks = {
    onOpen: () => { void api.openPath(repo.path, path).catch((error: unknown) => toast(errorText(error), 'warn')); },
    onReveal: () => { void api.revealPath(repo.path, path).catch((error: unknown) => toast(errorText(error), 'warn')); },
    onInfo: (info) => {
      if (state.detail[scope].token !== token) return;
      if (kindEl && info?.label) kindEl.textContent = info.label;
    }
  };

  void loadDetailBody(scope, token, entry, change, activeMode, slot, kindEl, callbacks);
}

async function loadDetailBody(
  scope: DetailScope,
  token: number,
  entry: RepoEntry,
  change: GitStatusFile | null,
  mode: PaneMode,
  slot: HTMLElement | null,
  kindEl: HTMLElement | null,
  callbacks: PreviewCallbacks
): Promise<void> {
  if (!slot || !state.repo) return;
  const repo = state.repo;
  const path = entry.path;
  const current = (): boolean => state.detail[scope].token === token;

  if (mode === 'diff') {
    try {
      const result = await api.readDiff(repo.path, path, !!change?.staged);
      if (!current()) return;
      if (result.binary) {
        slot.innerHTML = '';
        const warning = document.createElement('div');
        warning.className = 'binary-view';
        warning.innerHTML = `<span class="b-icon">${icon('file')}</span><h3>Binary changes</h3><p>Git can’t show a text diff for this file. Open it in its default application to inspect the change.</p>`;
        const actions = document.createElement('div');
        actions.className = 'preview-actions';
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'preview-tool-btn';
        open.textContent = 'Open file';
        open.addEventListener('click', () => callbacks.onOpen?.());
        actions.appendChild(open);
        warning.appendChild(actions);
        slot.appendChild(warning);
        if (kindEl) kindEl.textContent = 'binary · no text diff';
        return;
      }
      if (!result.diff || !result.diff.includes('@@')) {
        slot.innerHTML = `<div class="preview-empty">
          <span class="e-icon">${icon('check')}</span>
          <h3>No text changes</h3>
          <p>There is no textual diff for this file in the selected area.</p>
        </div>`;
        if (kindEl) kindEl.textContent = 'no changes';
        return;
      }
      slot.innerHTML = `<div class="diff-scroll"><div class="diff-body">${renderDiffBody(result.diff)}</div></div>`;
      if (kindEl) kindEl.textContent = `unified · ${change?.status === 'A' ? 'new file' : change?.status === 'D' ? 'deleted' : 'modified'}`;
    } catch (error) {
      if (!current()) return;
      showDetailError(slot, kindEl, errorText(error), callbacks);
    }
    return;
  }

  try {
    const data = await api.readPreview(repo.path, path);
    if (!current()) return;
    const cleanup = await mountPreview(slot, data, callbacks);
    if (!current()) {
      try { cleanup(); } catch { /* ignore */ }
      return;
    }
    state.detail[scope].cleanup = cleanup;
    if (kindEl) {
      if (data.kind !== 'link' && data.deleted) kindEl.textContent = `${kindEl.textContent || 'Preview'} · from HEAD`;
      else if (!kindEl.textContent || kindEl.textContent === 'Loading preview…') {
        const size = data.kind === 'link' ? 0 : data.size;
        kindEl.textContent = `${fileLanguageLabel(path)} · ${fmtBytes(size)}`;
      }
    }
  } catch (error) {
    if (!current()) return;
    showDetailError(slot, kindEl, errorText(error), callbacks);
  }
}

function showDetailError(slot: HTMLElement | null, kindEl: HTMLElement | null, message: string, callbacks: PreviewCallbacks): void {
  if (!slot) return;
  slot.innerHTML = `<div class="preview-error">
    <span class="e-icon">${icon('alert')}</span>
    <h3>Preview unavailable</h3>
    <p>${esc(message || 'The file could not be previewed.')}</p>
    <div class="preview-actions">
      <button class="preview-tool-btn" data-detail-open>Open in default app</button>
      <button class="preview-tool-btn" data-detail-reveal>Show in folder</button>
    </div>
  </div>`;
  const open = slot.querySelector('[data-detail-open]');
  const reveal = slot.querySelector('[data-detail-reveal]');
  if (open) open.addEventListener('click', () => callbacks.onOpen?.());
  if (reveal) reveal.addEventListener('click', () => callbacks.onReveal?.());
  if (kindEl) kindEl.textContent = 'unavailable';
}

function renderDiffBody(diff: string): string {
  let oldLine = 1;
  let newLine = 1;
  let inHunk = false;
  const lines = String(diff || '').split('\n');
  let html = '';
  for (const raw of lines) {
    if (raw.startsWith('@@')) {
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = Number(match[1]);
        newLine = Number(match[2]);
      }
      inHunk = true;
      html += `<div class="diff-hunk"><span>${esc(raw)}</span></div>`;
      continue;
    }
    if (!inHunk) continue;
    if (raw.startsWith('\\')) continue;
    if (!raw) continue;
    let cls = 'ctx';
    let sign = '';
    let oldNo = String(oldLine);
    let newNo = String(newLine);
    let code = raw;
    if (raw.startsWith('+')) {
      cls = 'add'; sign = '+'; newNo = String(newLine++); oldNo = ''; code = raw.slice(1);
    } else if (raw.startsWith('-')) {
      cls = 'del'; sign = '-'; oldNo = String(oldLine++); newNo = ''; code = raw.slice(1);
    } else if (raw.startsWith(' ')) {
      oldLine += 1; newLine += 1; code = raw.slice(1);
    } else {
      continue;
    }
    html += `<div class="diff-line ${cls}">
      <span class="ln old">${oldNo}</span>
      <span class="ln new">${newNo}</span>
      <span class="sign">${sign}</span>
      <span class="code">${esc(code)}</span>
    </div>`;
  }
  return html;
}

function selectFile(filePath: string): void {
  if (!state.repo) return;
  if (state.selectedFile === filePath && state.paneMode === 'preview') return;
  state.selectedFile = filePath;
  state.paneMode = 'preview';
  expandTreeAncestors(filePath);
  renderFileTree();
}

function setPaneMode(scope: DetailScope, mode: PaneMode): void {
  if (scope === 'main') state.paneMode = mode;
  else state.chatPaneMode = mode;
  renderDetail(scope, { force: true });
}

/* ============================================================
   Actions: stage, commit, refresh, fetch/pull/push
   ============================================================ */
async function refreshRepo({ silent = false, spinner = false }: { silent?: boolean; spinner?: boolean } = {}): Promise<void> {
  if (!state.repo || state.busyAction === 'refresh') return;
  const target = state.repo.path;
  if (spinner) {
    state.busyAction = 'refresh';
    renderSummary();
  }
  try {
    const snapshot = await api.getSnapshot(target);
    if (state.activeRepo !== target || state.repo?.path !== target) return;
    const previousSelected = state.selectedFile;
    const previousChatSelected = state.chatSelectedFile;
    state.repo = prepareRepo(snapshot);
    resetChatHistoryPaging();
    mergeSummaryFromSnapshot(snapshot);
    repoEntries(state.repo);
    if (previousSelected && state.repo._entryMap?.has(previousSelected)) state.selectedFile = previousSelected;
    else state.selectedFile = pickTreeFile(state.repo);
    if (previousChatSelected && state.repo.files.some((file) => file.path === previousChatSelected)) state.chatSelectedFile = previousChatSelected;
    else state.chatSelectedFile = pickChatFile(state.repo);
    renderAll();
    void loadWorktrees(target, { silent: true });
    void loadRemotes(target, { silent: true });
    void loadBranches(target, { silent: true });
    void loadTags(target, { silent: true });
    void loadStashes(target, { silent: true });
    void loadLfsReport(target, { silent: true });
    void loadSubmodules(target, { silent: true });
    if (state.statistics || state.activeTab === 'statistics') {
      void loadStatistics(target, { silent: true });
    }
    if (!silent && spinner) toast('Repository refreshed', 'success');
  } catch (error) {
    if (!silent) toast(errorText(error), 'warn');
  } finally {
    if (state.busyAction === 'refresh') {
      state.busyAction = null;
      renderSummary();
    }
  }
}

async function refreshSummaries(): Promise<void> {
  try {
    const data = await api.getSummaries();
    state.repos = data.repos || state.repos;
    state.activeRepo = data.activeRepo || state.activeRepo;
    renderProjectList();
    renderSidebarMeta();
  } catch {
    /* ignore */
  }
}

async function openRepository(): Promise<void> {
  try {
    const result = await api.openRepository();
    if (!result || result.canceled) return;
    applyBootstrap(result.bootstrap);
    await loadRepo(result.path);
    hideSplash();
    toast(`Opened ${getRepoSummary(result.path)?.name || 'repository'}`, 'success');
  } catch (error) {
    toast(errorText(error), 'warn');
  }
}

async function removeCurrentRepo(): Promise<void> {
  if (!state.repo) {
    toast('No repository is open', 'info');
    return;
  }
  const repo = state.repo;
  const confirmed = window.confirm(`Remove “${repo.name}” from GitGlance?\n\nThe repository will stay on disk.`);
  if (!confirmed) return;
  try {
    const result = await api.removeRepository(repo.path);
    applyBootstrap(result.bootstrap);
    if (state.activeRepo) await loadRepo(state.activeRepo);
    else showOnboarding();
    toast(`${repo.name} removed from workspace`, 'info');
  } catch (error) {
    toast(errorText(error), 'warn');
  }
}

async function toggleStage(filePath: string): Promise<void> {
  if (!state.repo || state.staging) return;
  const file = state.repo.files.find((candidate) => candidate.path === filePath);
  if (!file) return;
  state.staging = true;
  try {
    if (file.staged) await api.unstage(state.repo.path, filePath);
    else await api.stage(state.repo.path, filePath);
  } catch (error) {
    toast(errorText(error), 'warn');
  } finally {
    state.staging = false;
    await refreshRepo({ silent: true });
  }
}

async function stageAllGroup(kind: 'staged' | 'unstaged'): Promise<void> {
  if (!state.repo || state.staging) return;
  state.staging = true;
  try {
    if (kind === 'staged') await api.unstageAll(state.repo.path);
    else await api.stageAll(state.repo.path);
  } catch (error) {
    toast(errorText(error), 'warn');
  } finally {
    state.staging = false;
    await refreshRepo({ silent: true });
  }
}

async function commitChanges(): Promise<void> {
  if (!state.repo || state.committing) return;
  const staged = state.repo.files.filter((file) => file.staged);
  const input = $<HTMLInputElement>('#commitMessage');
  const message = input?.value.trim() || '';
  if (!staged.length) {
    toast('Stage at least one file before committing', 'warn');
    return;
  }
  if (!message) {
    const wrap = $('#commitInputWrap');
    wrap?.classList.remove('shake');
    void wrap?.offsetWidth;
    wrap?.classList.add('shake');
    input?.focus();
    toast('Add a commit message first', 'warn');
    return;
  }
  state.committing = true;
  updateCommitBar();
  try {
    const result = await api.commit(state.repo.path, message);
    state.commitDrafts.delete(state.repo.path);
    if (input) input.value = '';
    await refreshRepo({ silent: true });
    await refreshSummaries();
    toast(`Committed ${result.sha || 'changes'} to ${state.repo?.branch || 'branch'}`, 'success');
  } catch (error) {
    toast(errorText(error), 'warn');
  } finally {
    state.committing = false;
    updateCommitBar();
  }
}

function briefGitOutput(output: string, fallback: string): string {
  const line = String(output || '').split('\n').map((part) => part.trim()).filter(Boolean).slice(0, 2).join(' · ');
  if (!line) return fallback;
  return line.length > 170 ? `${line.slice(0, 167)}…` : line;
}

async function runRepoAction(action: BusyAction): Promise<void> {
  if (!state.repo || state.busyAction) return;
  const repo = state.repo;
  state.busyAction = action;
  renderSummary();
  try {
    if (action === 'fetch') {
      const output = await api.fetch(repo.path, {
        all: !!state.settings.fetchAll,
        prune: !!state.settings.prune
      });
      await refreshRepo({ silent: true });
      await refreshSummaries();
      toast(briefGitOutput(output, `Fetched ${repo.upstream || 'remotes'}`), 'success');
    } else if (action === 'pull') {
      const output = await api.pull(repo.path, state.settings.pullStrategy || 'merge');
      await refreshRepo({ silent: true });
      await refreshSummaries();
      toast(briefGitOutput(output, 'Pulled changes'), 'success');
    } else if (action === 'push') {
      const output = await api.push(repo.path);
      await refreshRepo({ silent: true });
      await refreshSummaries();
      toast(briefGitOutput(output, 'Pushed commits'), 'success');
    }
  } catch (error) {
    toast(errorText(error), 'warn');
  } finally {
    state.busyAction = null;
    renderSummary();
  }
}

async function openRepoFolder(): Promise<void> {
  if (!state.repo) return;
  try {
    await api.openRepoFolder(state.repo.path);
    toast('Opened project folder', 'info');
  } catch (error) {
    toast(errorText(error), 'warn');
  }
}

async function openRepoTerminal(): Promise<void> {
  if (!state.repo) return;
  try {
    await api.openRepoTerminal(state.repo.path);
    toast('Opened terminal at the project path', 'info');
  } catch (error) {
    toast(errorText(error), 'warn');
  }
}

async function stashWorkingTree(): Promise<void> {
  if (!state.repo || state.busyAction) return;
  const repo = state.repo;
  if (!repo.files.length) {
    toast('Working tree is clean — nothing to stash', 'info');
    return;
  }
  state.busyAction = 'stash';
  renderSummary();
  try {
    const output = await api.stashChanges(repo.path);
    if (state.repo?.path === repo.path) {
      await refreshRepo({ silent: true });
      await refreshSummaries();
    }
    toast(briefGitOutput(output, 'Stashed working tree changes'), 'success');
  } catch (error) {
    toast(errorText(error), 'warn');
  } finally {
    if (state.busyAction === 'stash') state.busyAction = null;
    renderSummary();
  }
}

async function silentAutoFetch() {
  if (!state.repo || state.busyAction || state.loadingRepo || state.staging || state.committing) return;
  const repo = state.repo;
  try {
    await api.fetch(repo.path, { all: !!state.settings.fetchAll, prune: !!state.settings.prune });
    await refreshRepo({ silent: true });
    await refreshSummaries();
  } catch {
    /* background fetch failures are not interruptive */
  }
}

function scheduleAutoFetch(): void {
  if (state.autoFetchTimer) {
    clearInterval(state.autoFetchTimer);
    state.autoFetchTimer = null;
  }
  const minutes = Number(state.settings.autoFetch);
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  state.autoFetchTimer = setInterval(silentAutoFetch, minutes * 60 * 1000);
}

function renderAll(): void {
  if (!state.repo) return;
  renderTitlebar();
  renderProjectList();
  renderSummary();
  renderSidebarMeta();
  renderTabChrome();
  renderFileTree();
  renderWorktrees();
  renderRemotes();
  renderBranches();
  renderTags();
  renderStashes();
  renderLfs();
  renderSubmodules();
  renderStatistics();
  renderChat();
  updateCommitBar();
}

/* ============================================================
   Settings
   ============================================================ */
let lastFocusedElement: HTMLElement | null = null;

interface CommitContext {
  sha: string;
  short: string;
  message: string;
  root: boolean;
  branch: string;
}

interface CommitActionState extends CommitContext {
  type: 'branch' | 'tag' | 'reset';
  mode: ResetMode;
}

let contextCommit: CommitContext | null = null;
let commitAction: CommitActionState | null = null;
let commitActionBusy = false;

function customPromptTitle(text: string): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > MAX_CUSTOM_PROMPT_TITLE_LENGTH
    ? `${singleLine.slice(0, MAX_CUSTOM_PROMPT_TITLE_LENGTH - 1).trimEnd()}…`
    : singleLine;
}

function readCustomPromptRows(): CustomPrompt[] {
  return $$<HTMLElement>('#customPromptList .prompt-editor-row').map((row) => ({
    title: row.querySelector<HTMLInputElement>('[data-prompt-title]')?.value ?? '',
    prompt: row.querySelector<HTMLTextAreaElement>('[data-prompt-input]')?.value ?? ''
  }));
}

function renderCustomPromptEditor(prompts: CustomPrompt[]): void {
  const list = $('#customPromptList');
  if (!list) return;
  if (!prompts.length) {
    list.innerHTML = '<p class="prompt-editor-empty">No custom prompts yet.</p>';
  } else {
    list.innerHTML = prompts.map((prompt, index) => `
      <div class="prompt-editor-row">
        <div class="prompt-editor-fields">
          <input class="input prompt-title-input" data-prompt-title type="text" maxlength="${MAX_CUSTOM_PROMPT_TITLE_LENGTH}" placeholder="Short title" spellcheck="false" aria-label="Prompt title ${index + 1}" value="${esc(prompt.title)}">
          <textarea class="input prompt-textarea" data-prompt-input rows="2" placeholder="Ask the Pi agent to…" spellcheck="false" aria-label="Custom prompt ${index + 1}">${esc(prompt.prompt)}</textarea>
        </div>
        <button class="icon-btn" type="button" data-remove-prompt="${index}" title="Remove prompt" aria-label="Remove prompt">${icon('x')}</button>
      </div>`).join('');
  }
  const count = $('#customPromptCount');
  if (count) count.textContent = `${prompts.length} / ${MAX_CUSTOM_PROMPTS}`;
  const add = $<HTMLButtonElement>('#addCustomPrompt');
  if (add) add.disabled = prompts.length >= MAX_CUSTOM_PROMPTS;
}

function addCustomPromptRow(): void {
  const prompts = readCustomPromptRows();
  if (prompts.length >= MAX_CUSTOM_PROMPTS) return;
  prompts.push({ title: '', prompt: '' });
  renderCustomPromptEditor(prompts);
  const inputs = $$<HTMLInputElement>('#customPromptList [data-prompt-title]');
  inputs[inputs.length - 1]?.focus();
}

function removeCustomPromptRow(index: number): void {
  const prompts = readCustomPromptRows().filter((_, row) => row !== index);
  renderCustomPromptEditor(prompts);
}

function populateSettingsForm(): void {
  const settings = state.settings || {};
  $<HTMLInputElement>('#setName')!.value = state.currentUser.name || settings.name || '';
  $<HTMLInputElement>('#setEmail')!.value = state.currentUser.email || settings.email || '';
  $<HTMLInputElement>('#setDefaultBranch')!.value = settings.defaultBranch || 'main';
  $<HTMLInputElement>('#setEditor')!.value = settings.editor || 'nvim';
  $$('#pullStrategy button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.value === (settings.pullStrategy || 'merge'));
  });
  const theme = normalizeThemeMode(settings.theme || state.themeMode);
  updateThemeControls(theme);
  updateZoomControls(settings.zoom ?? null);
  updateLanguageControls(normalizeLanguageMode(settings.language || state.language));
  $<HTMLSelectElement>('#setAutoFetch')!.value = settings.autoFetch || '15';
  $<HTMLInputElement>('#setSign')!.checked = !!settings.sign;
  $<HTMLInputElement>('#setGpgKey')!.value = settings.gpgKey || '';
  $<HTMLElement>('#gpgField')!.hidden = !settings.sign;
  $<HTMLInputElement>('#setPrune')!.checked = settings.prune !== false;
  $<HTMLInputElement>('#setFetchAll')!.checked = !!settings.fetchAll;
  const llm = normalizeLlmSettings(settings.llm);
  $<HTMLInputElement>('#setLlmProvider')!.value = llm.provider;
  $<HTMLInputElement>('#setLlmModel')!.value = llm.model;
  $<HTMLSelectElement>('#setLlmApi')!.value = llm.api;
  $<HTMLInputElement>('#setLlmBaseUrl')!.value = llm.baseUrl;
  $<HTMLInputElement>('#setLlmApiKey')!.value = llm.apiKey;
  $<HTMLTextAreaElement>('#setSystemPrompt')!.value = settings.systemPrompt || '';
  renderCustomPromptEditor(settings.customPrompts || []);
}

function openSettings(): void {
  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  populateSettingsForm();
  const backdrop = $<HTMLElement>('#settingsBackdrop')!;
  backdrop.classList.add('is-open');
  backdrop.setAttribute('aria-hidden', 'false');
  const body = $('.modal-body');
  if (body) body.scrollTop = 0;
  setTimeout(() => $<HTMLInputElement>('#setName')!.focus({ preventScroll: true }), 90);
}

function closeSettings(): void {
  const backdrop = $<HTMLElement>('#settingsBackdrop')!;
  backdrop.classList.remove('is-open');
  backdrop.setAttribute('aria-hidden', 'true');
  if (lastFocusedElement?.focus) lastFocusedElement.focus();
}

let aboutLastFocus: HTMLElement | null = null;

function openAbout(): void {
  aboutLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const backdrop = $<HTMLElement>('#aboutBackdrop');
  if (!backdrop) return;
  backdrop.classList.add('is-open');
  backdrop.setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#aboutClose')?.focus({ preventScroll: true }), 60);
}

function closeAbout(): void {
  const backdrop = $<HTMLElement>('#aboutBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('is-open');
  backdrop.setAttribute('aria-hidden', 'true');
  aboutLastFocus?.focus();
}

async function saveSettings(): Promise<void> {
  if (state.savingSettings) return;
  const activePull = $<HTMLButtonElement>('#pullStrategy button.is-active');
  const activeTheme = $<HTMLButtonElement>('#themeMode button.is-active');
  const activeLanguage = $<HTMLButtonElement>('#languageMode button.is-active');
  const settings = {
    name: $<HTMLInputElement>('#setName')!.value.trim(),
    email: $<HTMLInputElement>('#setEmail')!.value.trim(),
    defaultBranch: $<HTMLInputElement>('#setDefaultBranch')!.value.trim() || 'main',
    editor: $<HTMLInputElement>('#setEditor')!.value.trim() || 'nvim',
    pullStrategy: normalizePullStrategy(activePull?.dataset.value),
    autoFetch: normalizeAutoFetch($<HTMLSelectElement>('#setAutoFetch')!.value),
    sign: $<HTMLInputElement>('#setSign')!.checked,
    gpgKey: $<HTMLInputElement>('#setGpgKey')!.value.trim(),
    prune: $<HTMLInputElement>('#setPrune')!.checked,
    fetchAll: $<HTMLInputElement>('#setFetchAll')!.checked,
    theme: normalizeThemeMode(activeTheme?.dataset.value),
    language: normalizeLanguageMode(activeLanguage?.dataset.value || state.settings.language),
    systemPrompt: $<HTMLTextAreaElement>('#setSystemPrompt')!.value,
    customPrompts: readCustomPromptRows()
      .map(({ title, prompt }) => {
        const body = prompt.trim();
        return { title: title.trim() || customPromptTitle(body), prompt: body };
      })
      .filter((prompt) => prompt.prompt),
    llm: {
      provider: $<HTMLInputElement>('#setLlmProvider')!.value.trim(),
      api: normalizeLlmApiType($<HTMLSelectElement>('#setLlmApi')!.value),
      baseUrl: $<HTMLInputElement>('#setLlmBaseUrl')!.value.trim(),
      apiKey: $<HTMLInputElement>('#setLlmApiKey')!.value.trim(),
      model: $<HTMLInputElement>('#setLlmModel')!.value.trim()
    }
  };
  const saveButton = $<HTMLButtonElement>('#settingsSave')!;
  state.savingSettings = true;
  if (saveButton) saveButton.disabled = true;
  try {
    const result = await api.saveSettings(settings);
    state.settings = { ...state.settings, ...result.settings };
    state.currentUser = result.currentUser || state.currentUser;
    if (result.pi) {
      state.pi = result.pi;
      // Saving the provider restarts Pi sessions, so no response is still live.
      state.chats.forEach((chat) => {
        if (!chat.streaming) return;
        chat.streaming = false;
        chat.stopping = false;
        chat.tool = null;
        const assistant = [...chat.messages].reverse().find((message) => message.role === 'assistant' && message.streaming);
        if (assistant) {
          assistant.streaming = false;
          assistant.tool = null;
          assistant.aborted = true;
          assistant._rendered = null;
        }
      });
      renderChatHead();
      renderChatThread();
      syncChatComposer();
    }
    applyTheme(state.settings.theme || 'dark');
    applyLanguage(state.settings.language || 'en');
    updateUserUI();
    renderSidebarMeta();
    renderSummary();
    renderChatHead();
    scheduleAutoFetch();
    closeSettings();
    toast('Git settings saved to ~/.gitconfig', 'success');
  } catch (error) {
    toast(errorText(error), 'warn');
  } finally {
    state.savingSettings = false;
    if (saveButton) saveButton.disabled = false;
  }
}

/* ============================================================
   Chat actions
   ============================================================ */
function openWorktreeFromChat(): void {
  if (!state.chatSelectedFile) {
    switchTab('files');
    return;
  }
  state.selectedFile = state.chatSelectedFile;
  state.paneMode = state.chatPaneMode;
  state.fileQuery = '';
  expandTreeAncestors(state.selectedFile);
  switchTab('files');
  renderFileTree();
}

/* ============================================================
   Toasts & copy
   ============================================================ */
function toast(message: string, type: 'info' | 'success' | 'warn' = 'info'): void {
  const stack = $('#toastStack');
  if (!stack) return;
  while (stack.children.length >= 3) stack.firstElementChild?.remove();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const iconName = type === 'success' ? 'check' : type === 'warn' ? 'alert' : 'info';
  el.innerHTML = `<span class="t-icon">${icon(iconName)}</span><span>${esc(message)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 230);
  }, 3200);
}

async function copyText(text: string, message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(message, 'info');
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    area.remove();
    toast(message, 'info');
  }
}

/* ============================================================
   Tab switching & menus
   ============================================================ */
function switchTab(tab: Tab): void {
  if (!state.repo) return;
  if (state.activeTab === tab) return;
  state.activeTab = tab;

  if (tab !== 'files') {
    disposeDetail('main');
    const pane = $('#diffPane');
    if (pane) pane.innerHTML = '';
  }
  if (tab !== 'chat') {
    disposeDetail('chat');
    const pane = $('#chatDetail');
    if (pane) pane.innerHTML = '';
  }

  renderTabChrome();
  if (tab === 'files') {
    renderFileTree();
  } else if (tab === 'chat') {
    renderChatThread();
    renderChatSide();
    syncChatInput();
    requestAnimationFrame(() => maybeLoadOlderHistory());
    if (state.chatPreviewOpen) renderDetail('chat');
  } else if (tab === 'worktrees') {
    renderWorktrees();
    if (!state.worktrees.length && !state.worktreesLoading && !state.worktreesError) {
      void loadWorktrees(state.repo.path, { silent: true });
    }
  } else if (tab === 'remotes') {
    renderRemotes();
    if (!state.remotes.length && !state.remotesLoading && !state.remotesError) {
      void loadRemotes(state.repo.path, { silent: true });
    }
  } else if (tab === 'branches') {
    renderBranches();
    if (!state.branches.length && !state.branchesLoading && !state.branchesError) {
      void loadBranches(state.repo.path, { silent: true });
    }
  } else if (tab === 'tags') {
    renderTags();
    if (!state.tags.length && !state.tagsLoading && !state.tagsError) {
      void loadTags(state.repo.path, { silent: true });
    }
  } else if (tab === 'stashes') {
    renderStashes();
    if (!state.stashes.length && !state.stashesLoading && !state.stashesError) {
      void loadStashes(state.repo.path, { silent: true });
    }
  } else if (tab === 'lfs') {
    renderLfs();
    if (!state.lfsReport && !state.lfsLoading && !state.lfsError) {
      void loadLfsReport(state.repo.path, { silent: true });
    }
  } else if (tab === 'submodules') {
    renderSubmodules();
    if (!state.submodules.length && !state.submodulesLoading && !state.submodulesError) {
      void loadSubmodules(state.repo.path, { silent: true });
    }
  } else if (tab === 'statistics') {
    renderStatistics();
    if (!state.statistics && !state.statisticsLoading && !state.statisticsError) {
      void loadStatistics(state.repo.path);
    }
  }
}

function applySidebarState(): void {
  const app = document.querySelector('.app');
  if (app) app.classList.toggle('is-sidebar-hidden', state.sidebarHidden);
  const sidebar = $('#projectSidebar');
  if (sidebar) sidebar.inert = state.sidebarHidden;
  const button = $('#sidebarToggle');
  if (!button) return;
  const label = state.sidebarHidden ? 'Show projects' : 'Hide projects';
  button.setAttribute('title', label);
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', String(state.sidebarHidden));
}

function toggleSidebar(): void {
  state.sidebarHidden = !state.sidebarHidden;
  applySidebarState();
}

function handleMenu(action: MenuAction): void {
  if (action === 'open-repository') openRepository();
  else if (action === 'refresh') refreshRepo({ spinner: true });
  else if (action === 'settings') openSettings();
  else if (action === 'remove-repository') removeCurrentRepo();
}

/* ============================================================
   Static event wiring
   ============================================================ */
function bindStaticEvents(): void {
  $('#projectList')?.addEventListener('click', (event) => {
    const button = eventTarget(event)?.closest<HTMLElement>('[data-repo-path]');
    if (!button) return;
    loadRepo(button.dataset.repoPath);
  });

  const projectSearch = $<HTMLInputElement>('#projectSearch');
  projectSearch?.addEventListener('input', () => {
    state.projectQuery = projectSearch.value;
    renderProjectList();
    syncSearchUI($('#projectSearchWrap'), projectSearch);
  });
  $('#projectSearchClear')?.addEventListener('click', () => {
    if (!projectSearch) return;
    projectSearch.value = '';
    state.projectQuery = '';
    renderProjectList();
    syncSearchUI($('#projectSearchWrap'), projectSearch);
    projectSearch.focus();
  });

  $$('.tab').forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab as Tab)));

  const tabSearch = $<HTMLInputElement>('#tabSearch');
  tabSearch?.addEventListener('input', () => {
    if (state.activeTab === 'files') {
      state.fileQuery = tabSearch.value;
      renderFileTree();
    } else if (state.activeTab === 'worktrees') {
      state.worktreesQuery = tabSearch.value;
      renderWorktrees();
    } else if (state.activeTab === 'remotes') {
      state.remotesQuery = tabSearch.value;
      renderRemotes();
    } else if (state.activeTab === 'branches') {
      state.branchesQuery = tabSearch.value;
      renderBranches();
    } else if (state.activeTab === 'tags') {
      state.tagsQuery = tabSearch.value;
      renderTags();
    } else if (state.activeTab === 'stashes') {
      state.stashesQuery = tabSearch.value;
      renderStashes();
    } else if (state.activeTab === 'lfs') {
      state.lfsQuery = tabSearch.value;
      renderLfs();
    } else if (state.activeTab === 'submodules') {
      state.submodulesQuery = tabSearch.value;
      renderSubmodules();
    }
    syncSearchUI($('#tabSearchWrap'), tabSearch);
  });
  $('#tabSearchClear')?.addEventListener('click', () => {
    if (!tabSearch) return;
    if (state.activeTab === 'files') {
      state.fileQuery = '';
      renderFileTree();
    } else if (state.activeTab === 'worktrees') {
      state.worktreesQuery = '';
      renderWorktrees();
    } else if (state.activeTab === 'remotes') {
      state.remotesQuery = '';
      renderRemotes();
    } else if (state.activeTab === 'branches') {
      state.branchesQuery = '';
      renderBranches();
    } else if (state.activeTab === 'tags') {
      state.tagsQuery = '';
      renderTags();
    } else if (state.activeTab === 'stashes') {
      state.stashesQuery = '';
      renderStashes();
    } else if (state.activeTab === 'lfs') {
      state.lfsQuery = '';
      renderLfs();
    } else if (state.activeTab === 'submodules') {
      state.submodulesQuery = '';
      renderSubmodules();
    }
    tabSearch.value = '';
    syncSearchUI($('#tabSearchWrap'), tabSearch);
    tabSearch.focus();
  });

  $('#changesPane')?.addEventListener('click', (event) => {
    const stage = eventTarget(event)?.closest<HTMLElement>('[data-stage]');
    if (stage) {
      event.preventDefault();
      event.stopPropagation();
      toggleStage(stage.dataset.stage || '');
      return;
    }
    const folder = eventTarget(event)?.closest<HTMLElement>('[data-repo-folder]');
    if (folder) {
      const key = folder.dataset.repoFolder;
      if (!key) return;
      if (state.treeExpanded.has(key)) state.treeExpanded.delete(key);
      else state.treeExpanded.add(key);
      renderFileTree();
      return;
    }
    const groupAction = eventTarget(event)?.closest<HTMLElement>('[data-stage-group]');
    if (groupAction) {
      stageAllGroup(groupAction.dataset.stageGroup as 'staged' | 'unstaged');
      return;
    }
    const row = eventTarget(event)?.closest<HTMLElement>('[data-file]');
    if (row) selectFile(row.dataset.file || '');
  });

  $('#chatHistoryList')?.addEventListener('click', (event) => {
    const retry = eventTarget(event)?.closest<HTMLElement>('[data-action="retry-history"]');
    if (retry) {
      state.historyError = null;
      updateChatHistoryFooter();
      void loadOlderHistory();
      return;
    }
    const hash = eventTarget(event)?.closest<HTMLElement>('[data-copy-sha]');
    if (!hash) return;
    const sha = hash.dataset.copySha;
    if (sha) copyText(sha, `Copied ${sha.slice(0, 7)} to clipboard`);
  });

  $('#chatChanges')?.addEventListener('click', (event) => {
    const stage = eventTarget(event)?.closest<HTMLElement>('[data-stage]');
    if (stage) {
      event.preventDefault();
      event.stopPropagation();
      toggleStage(stage.dataset.stage || '');
      return;
    }
    const groupAction = eventTarget(event)?.closest<HTMLElement>('[data-stage-group]');
    if (groupAction) {
      stageAllGroup(groupAction.dataset.stageGroup as 'staged' | 'unstaged');
      return;
    }
    const folder = eventTarget(event)?.closest<HTMLElement>('[data-chat-folder]');
    if (folder) {
      const folderPath = folder.dataset.chatFolder || '';
      if (state.chatTreeCollapsed.has(folderPath)) state.chatTreeCollapsed.delete(folderPath);
      else state.chatTreeCollapsed.add(folderPath);
      renderChatSide();
      return;
    }
    const row = eventTarget(event)?.closest<HTMLElement>('[data-chat-file]');
    if (row) selectChatFile(row.dataset.chatFile || '');
  });

  $('#chatHistoryList')?.addEventListener('contextmenu', (event) => {
    const row = eventTarget(event)?.closest<HTMLElement>('[data-commit-sha]');
    if (!row) return;
    event.preventDefault();
    openCommitMenu(row, event.clientX, event.clientY);
  });

  $('#commitMenu')?.addEventListener('click', (event) => {
    const item = eventTarget(event)?.closest<HTMLButtonElement>('[data-commit-action]');
    if (!item || item.disabled) return;
    const commit = contextCommit;
    const action = item.dataset.commitAction;
    closeCommitMenu();
    if (!commit) return;
    if (action === 'copy-sha') {
      copyText(commit.sha, `Copied ${commit.short} to clipboard`);
    } else if (action === 'new-branch' || action === 'new-tag' || action === 'reset') {
      openCommitActionModal(action === 'new-branch' ? 'branch' : action === 'new-tag' ? 'tag' : 'reset', commit);
    } else if (action === 'cherry-pick' || action === 'revert' || action === 'squash') {
      void runCommitHistoryAction(action, commit);
    }
  });

  document.addEventListener('click', (event) => {
    if (!eventTarget(event)?.closest('#commitMenu')) closeCommitMenu();
  });
  document.addEventListener('contextmenu', (event) => {
    if (!eventTarget(event)?.closest('#chatHistoryList')) closeCommitMenu();
  });
  $('#chatHistoryList')?.addEventListener('scroll', () => {
    if (performance.now() < historyScrollGuardUntil) return;
    closeCommitMenu();
  }, true);
  $('#chatHistoryList')?.addEventListener('scroll', maybeLoadOlderHistory, { passive: true });
  window.addEventListener('resize', closeCommitMenu);
  window.addEventListener('resize', maybeLoadOlderHistory);

  $('#commitActionClose')?.addEventListener('click', closeCommitActionModal);
  $('#commitActionCancel')?.addEventListener('click', closeCommitActionModal);
  $('#commitActionConfirm')?.addEventListener('click', () => { void confirmCommitAction(); });
  $<HTMLElement>('#commitActionBackdrop')!?.addEventListener('click', (event) => {
    if (event.target === $<HTMLElement>('#commitActionBackdrop')!) closeCommitActionModal();
  });
  $('#commitActionBody')?.addEventListener('click', (event) => {
    const choice = eventTarget(event)?.closest<HTMLElement>('[data-reset-mode]');
    if (!choice) return;
    $$('#resetModeChoices .reset-choice').forEach((button) => {
      const active = button === choice;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
    });
    if (commitAction) commitAction.mode = (choice.dataset.resetMode || 'mixed') as ResetMode;
  });
  $('#commitActionBody')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.target as HTMLElement | null)?.id === 'commitActionInput') {
      event.preventDefault();
      void confirmCommitAction();
    }
  });

  $('#chatThread')?.addEventListener('click', (event) => {
    const link = eventTarget(event)?.closest<HTMLElement>('a[href]');
    if (link) {
      event.preventDefault();
      const href = link.getAttribute('href');
      if (href && /^https?:\/\//i.test(href)) void api.openExternal(href).catch((error: unknown) => toast(errorText(error), 'warn'));
      return;
    }
    const fileRef = eventTarget(event)?.closest<HTMLElement>('[data-chat-file]');
    if (fileRef) {
      event.preventDefault();
      selectChatFile(fileRef.dataset.chatFile || '');
      return;
    }
    const prompt = eventTarget(event)?.closest<HTMLElement>('[data-chat-prompt]');
    if (prompt) {
      const text = isChinese() && prompt.dataset.chatPromptZh
        ? prompt.dataset.chatPromptZh
        : prompt.dataset.chatPrompt || '';
      sendChatMessage(text);
    }
  });

  $('#chatContextRow')?.addEventListener('click', (event) => {
    const chip = eventTarget(event)?.closest<HTMLElement>('[data-custom-prompt]');
    if (!chip) return;
    sendCustomPrompt(Number(chip.dataset.customPrompt));
  });

  const chatInput = $<HTMLTextAreaElement>('#chatInput');
  chatInput?.addEventListener('input', () => {
    if (!state.repo) return;
    const chat = getChat(state.repo.path);
    chat.draft = chatInput.value;
    chat.historyIndex = null;
    resizeChatInput();
    syncChatComposer();
  });
  chatInput?.addEventListener('keydown', (event) => {
    const atEnd = chatInput.selectionStart === chatInput.value.length && chatInput.selectionEnd === chatInput.value.length;
    if (atEnd && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey && !event.isComposing
      && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const chat = state.repo ? getChat(state.repo.path) : null;
      if (chat?.messages.some((message) => message.role === 'user')) {
        event.preventDefault();
        navigateChatHistory(event.key === 'ArrowUp' ? -1 : 1, chatInput);
      }
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendChatMessage(chatInput.value);
    }
  });
  $('#chatSend')?.addEventListener('click', () => {
    if (!state.repo) return;
    if (getChat(state.repo.path).streaming) stopChat();
    else sendChatMessage($<HTMLTextAreaElement>('#chatInput')?.value || '');
  });
  $('#chatNew')?.addEventListener('click', resetChat);

  const commitInput = $<HTMLInputElement>('#commitMessage');
  commitInput?.addEventListener('input', () => {
    if (!state.repo) return;
    state.commitDrafts.set(state.repo.path, commitInput.value);
  });
  $('#commitBtn')?.addEventListener('click', commitChanges);

  $('#worktreesList')?.addEventListener('click', (event) => {
    const target = eventTarget(event);
    const open = target?.closest<HTMLElement>('[data-worktree-open]');
    if (open) {
      event.preventDefault();
      void openWorktreePath(open.dataset.worktreeOpen || '');
      return;
    }
    const reveal = target?.closest<HTMLElement>('[data-worktree-reveal]');
    if (reveal) {
      event.preventDefault();
      revealWorktreePath(reveal.dataset.worktreeReveal || '');
      return;
    }
    const copy = target?.closest<HTMLElement>('[data-worktree-copy]');
    if (copy) {
      event.preventDefault();
      copyText(copy.dataset.worktreeCopy || '', 'Worktree path copied to clipboard');
      return;
    }
    const hash = target?.closest<HTMLElement>('[data-copy-sha]');
    if (hash) {
      const sha = hash.dataset.copySha;
      if (sha) copyText(sha, `Copied ${sha.slice(0, 7)} to clipboard`);
    }
  });

  $('#remotesList')?.addEventListener('click', (event) => {
    const target = eventTarget(event);
    const fetchButton = target?.closest<HTMLElement>('[data-remote-fetch]');
    if (fetchButton) {
      event.preventDefault();
      void fetchRemote(fetchButton.dataset.remoteFetch || '');
      return;
    }
    const copy = target?.closest<HTMLElement>('[data-remote-copy]');
    if (copy) {
      event.preventDefault();
      copyText(copy.dataset.remoteCopy || '', 'Remote URL copied to clipboard');
      return;
    }
    const open = target?.closest<HTMLElement>('[data-remote-open]');
    if (open) {
      event.preventDefault();
      openRemoteUrl(open.dataset.remoteOpen || '');
      return;
    }
  });

  $('#branchesList')?.addEventListener('click', (event) => {
    const target = eventTarget(event);
    const checkout = target?.closest<HTMLElement>('[data-branch-checkout]');
    if (checkout) {
      event.preventDefault();
      void checkoutBranchAction(checkout.dataset.branchCheckout || '');
      return;
    }
    const copy = target?.closest<HTMLElement>('[data-branch-copy]');
    if (copy) {
      event.preventDefault();
      copyText(copy.dataset.branchCopy || '', 'Branch name copied to clipboard');
      return;
    }
    const hash = target?.closest<HTMLElement>('[data-copy-sha]');
    if (hash) {
      const sha = hash.dataset.copySha;
      if (sha) copyText(sha, `Copied ${sha.slice(0, 7)} to clipboard`);
    }
  });

  $('#tagsList')?.addEventListener('click', (event) => {
    const target = eventTarget(event);
    const checkout = target?.closest<HTMLElement>('[data-tag-checkout]');
    if (checkout) {
      event.preventDefault();
      void checkoutTagAction(checkout.dataset.tagCheckout || '');
      return;
    }
    const copy = target?.closest<HTMLElement>('[data-tag-copy]');
    if (copy) {
      event.preventDefault();
      copyText(copy.dataset.tagCopy || '', 'Tag name copied to clipboard');
      return;
    }
    const hash = target?.closest<HTMLElement>('[data-copy-sha]');
    if (hash) {
      const sha = hash.dataset.copySha;
      if (sha) copyText(sha, `Copied ${sha.slice(0, 7)} to clipboard`);
    }
  });

  $('#stashesList')?.addEventListener('click', (event) => {
    const target = eventTarget(event);
    const actionButton = target?.closest<HTMLElement>('[data-stash-action]');
    if (actionButton) {
      event.preventDefault();
      const action = actionButton.dataset.stashAction as StashAction | undefined;
      if (action === 'apply' || action === 'pop' || action === 'drop') {
        void performStashAction(actionButton.dataset.stashRef || '', action);
      }
      return;
    }
    const copy = target?.closest<HTMLElement>('[data-stash-copy]');
    if (copy) {
      event.preventDefault();
      copyText(copy.dataset.stashCopy || '', 'Stash reference copied to clipboard');
      return;
    }
    const hash = target?.closest<HTMLElement>('[data-copy-sha]');
    if (hash) {
      const sha = hash.dataset.copySha;
      if (sha) copyText(sha, `Copied ${sha.slice(0, 7)} to clipboard`);
    }
  });

  $('#lfsPanel')?.addEventListener('click', (event) => {
    const target = eventTarget(event);
    const open = target?.closest<HTMLElement>('[data-lfs-open]');
    if (open) {
      event.preventDefault();
      openLfsPath(open.dataset.lfsOpen || '');
      return;
    }
    const reveal = target?.closest<HTMLElement>('[data-lfs-reveal]');
    if (reveal) {
      event.preventDefault();
      revealLfsPath(reveal.dataset.lfsReveal || '');
    }
  });

  $('#submodulesList')?.addEventListener('click', (event) => {
    const target = eventTarget(event);
    const update = target?.closest<HTMLElement>('[data-submodule-update]');
    if (update) {
      event.preventDefault();
      void updateSubmoduleAction(update.dataset.submoduleUpdate || '');
      return;
    }
    const open = target?.closest<HTMLElement>('[data-submodule-open]');
    if (open) {
      event.preventDefault();
      void openSubmoduleAction(open.dataset.submoduleOpen || '');
      return;
    }
    const reveal = target?.closest<HTMLElement>('[data-submodule-reveal]');
    if (reveal) {
      event.preventDefault();
      revealSubmodulePath(reveal.dataset.submoduleReveal || '');
      return;
    }
    const hash = target?.closest<HTMLElement>('[data-copy-sha]');
    if (hash) {
      const sha = hash.dataset.copySha;
      if (sha) copyText(sha, `Copied ${sha.slice(0, 7)} to clipboard`);
    }
  });

  $('#openSettings')?.addEventListener('click', openSettings);
  $('#userChip')?.addEventListener('click', openSettings);
  $('#settingsClose')?.addEventListener('click', closeSettings);
  $('#settingsCancel')?.addEventListener('click', closeSettings);
  $<HTMLButtonElement>('#settingsSave')!?.addEventListener('click', saveSettings);

  $('#aboutButton')?.addEventListener('click', openAbout);
  $('#aboutClose')?.addEventListener('click', closeAbout);
  $('#aboutDone')?.addEventListener('click', closeAbout);
  const aboutBackdrop = $<HTMLElement>('#aboutBackdrop');
  aboutBackdrop?.addEventListener('click', (event) => {
    const link = eventTarget(event)?.closest<HTMLElement>('[data-about-link]');
    if (link) {
      event.preventDefault();
      const href = link.getAttribute('href');
      if (href && /^https?:\/\//i.test(href)) {
        void api.openExternal(href).catch((error: unknown) => toast(errorText(error), 'warn'));
      }
      return;
    }
    if (event.target === aboutBackdrop) closeAbout();
  });
  $('#addCustomPrompt')?.addEventListener('click', addCustomPromptRow);
  $('#customPromptList')?.addEventListener('click', (event) => {
    const remove = eventTarget(event)?.closest<HTMLElement>('[data-remove-prompt]');
    if (!remove) return;
    removeCustomPromptRow(Number(remove.dataset.removePrompt));
  });
  $<HTMLElement>('#settingsBackdrop')!?.addEventListener('click', (event) => {
    if (event.target === $<HTMLElement>('#settingsBackdrop')!) closeSettings();
  });

  $('#branchClose')?.addEventListener('click', closeBranchModal);
  $<HTMLElement>('#branchBackdrop')!?.addEventListener('click', (event) => {
    if (event.target === $<HTMLElement>('#branchBackdrop')!) closeBranchModal();
  });
  $('#branchFilter')?.addEventListener('input', () => {
    state.branchModalQuery = $<HTMLInputElement>('#branchFilter')?.value || '';
    renderBranchModal();
  });
  $('#branchNameInput')?.addEventListener('input', syncBranchCreateButton);
  $('#branchNameInput')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void createBranchFromModal();
    }
  });
  $('#branchPickList')?.addEventListener('click', (event) => {
    const target = eventTarget(event);
    const pick = target?.closest<HTMLElement>('[data-branch-base]');
    if (pick) {
      state.branchModalBase = pick.dataset.branchBase || null;
      renderBranchModal();
      return;
    }
    const swap = target?.closest<HTMLElement>('[data-branch-switch]');
    if (swap) void switchBranchFromModal(swap.dataset.branchSwitch || '');
  });
  $$('#pullStrategy button').forEach((button) => {
    button.addEventListener('click', () => {
      $$('#pullStrategy button').forEach((candidate) => candidate.classList.toggle('is-active', candidate === button));
    });
  });

  $$('#themeMode button').forEach((button) => {
    button.addEventListener('click', () => {
      void chooseTheme(button.dataset.value);
    });
  });
  $$('#languageMode button').forEach((button) => {
    button.addEventListener('click', () => {
      void chooseLanguage(button.dataset.value);
    });
  });
  $<HTMLInputElement>('#setZoom')?.addEventListener('input', (event) => {
    const input = eventTarget(event) as HTMLInputElement | null;
    if (!input) return;
    const factor = normalizeZoom(input.value);
    input.style.setProperty('--range-progress', `${(((factor ?? 1) - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100}%`);
    const label = $('#setZoomValue');
    if (label) label.textContent = zoomPercent(factor);
  });
  $<HTMLInputElement>('#setZoom')?.addEventListener('change', (event) => {
    void chooseZoom((eventTarget(event) as HTMLInputElement | null)?.value);
  });
  $<HTMLInputElement>('#setSign')!?.addEventListener('change', (event) => {
    const field = $<HTMLElement>('#gpgField')!;
    if (field) field.hidden = !(eventTarget(event) as HTMLInputElement | null)?.checked;
    if ((eventTarget(event) as HTMLInputElement | null)?.checked) setTimeout(() => $<HTMLInputElement>('#setGpgKey')!?.focus(), 30);
  });
  $('#addProject')?.addEventListener('click', openRepository);

  document.addEventListener('click', (event) => {
    const copyPath = eventTarget(event)?.closest<HTMLElement>('[data-copy-path]');
    if (copyPath) {
      copyText(copyPath.dataset.copyPath || '', 'Path copied to clipboard');
      return;
    }
    const modeButton = eventTarget(event)?.closest<HTMLElement>('[data-pane-mode]');
    if (modeButton) {
      const scopeElement = modeButton.closest<HTMLElement>('[data-detail-scope]');
      if (!scopeElement) return;
      setPaneMode(scopeElement.dataset.detailScope as DetailScope, modeButton.dataset.paneMode as PaneMode);
      return;
    }
    const actionElement = eventTarget(event)?.closest<HTMLElement>('[data-action]');
    if (!actionElement) return;
    const action = actionElement.dataset.action;
    if (action === 'toggle-sidebar') toggleSidebar();
    else if (action === 'open-repo') openRepository();
    else if (action === 'retry-repo') loadRepo(state.activeRepo || state.repos[0]?.path, { initial: false });
    else if (action === 'refresh') refreshRepo({ spinner: true });
    else if (action === 'fetch') runRepoAction('fetch');
    else if (action === 'pull') runRepoAction('pull');
    else if (action === 'push') runRepoAction('push');
    else if (action === 'stash') void stashWorkingTree();
    else if (action === 'branches') openBranchModal();
    else if (action === 'create-branch') void createBranchFromModal();
    else if (action === 'open-folder') void openRepoFolder();
    else if (action === 'open-terminal') void openRepoTerminal();
    else if (action === 'hide-chat-preview') hideChatPreview();
    else if (action === 'copy-path') {
      const repoPath = state.repo?.path || (state.activeRepo ? getRepoSummary(state.activeRepo)?.path : null);
      if (repoPath) copyText(repoPath, 'Repository path copied to clipboard');
    } else if (action === 'open-settings') openSettings();
    else if (action === 'open-worktree') openWorktreeFromChat();
    else if (action === 'clear-files') {
      state.fileQuery = '';
      if ($<HTMLInputElement>('#tabSearch')) $<HTMLInputElement>('#tabSearch')!.value = '';
      syncSearchUI($('#tabSearchWrap'), $<HTMLInputElement>('#tabSearch'));
      renderFileTree();
    } else if (action === 'refresh-worktrees') {
      if (state.repo) void loadWorktrees(state.repo.path);
    } else if (action === 'clear-worktrees') {
      state.worktreesQuery = '';
      if ($<HTMLInputElement>('#tabSearch')) $<HTMLInputElement>('#tabSearch')!.value = '';
      syncSearchUI($('#tabSearchWrap'), $<HTMLInputElement>('#tabSearch'));
      renderWorktrees();
    } else if (action === 'refresh-remotes') {
      if (state.repo) void loadRemotes(state.repo.path);
    } else if (action === 'clear-remotes') {
      state.remotesQuery = '';
      if ($<HTMLInputElement>('#tabSearch')) $<HTMLInputElement>('#tabSearch')!.value = '';
      syncSearchUI($('#tabSearchWrap'), $<HTMLInputElement>('#tabSearch'));
      renderRemotes();
    } else if (action === 'refresh-branches') {
      if (state.repo) void loadBranches(state.repo.path);
    } else if (action === 'clear-branches') {
      state.branchesQuery = '';
      if ($<HTMLInputElement>('#tabSearch')) $<HTMLInputElement>('#tabSearch')!.value = '';
      syncSearchUI($('#tabSearchWrap'), $<HTMLInputElement>('#tabSearch'));
      renderBranches();
    } else if (action === 'refresh-tags') {
      if (state.repo) void loadTags(state.repo.path);
    } else if (action === 'clear-tags') {
      state.tagsQuery = '';
      if ($<HTMLInputElement>('#tabSearch')) $<HTMLInputElement>('#tabSearch')!.value = '';
      syncSearchUI($('#tabSearchWrap'), $<HTMLInputElement>('#tabSearch'));
      renderTags();
    } else if (action === 'refresh-stashes') {
      if (state.repo) void loadStashes(state.repo.path);
    } else if (action === 'clear-stashes') {
      state.stashesQuery = '';
      if ($<HTMLInputElement>('#tabSearch')) $<HTMLInputElement>('#tabSearch')!.value = '';
      syncSearchUI($('#tabSearchWrap'), $<HTMLInputElement>('#tabSearch'));
      renderStashes();
    } else if (action === 'refresh-lfs') {
      if (state.repo) void loadLfsReport(state.repo.path);
    } else if (action === 'clear-lfs') {
      state.lfsQuery = '';
      if ($<HTMLInputElement>('#tabSearch')) $<HTMLInputElement>('#tabSearch')!.value = '';
      syncSearchUI($('#tabSearchWrap'), $<HTMLInputElement>('#tabSearch'));
      renderLfs();
    } else if (action === 'refresh-submodules') {
      if (state.repo) void loadSubmodules(state.repo.path);
    } else if (action === 'clear-submodules') {
      state.submodulesQuery = '';
      if ($<HTMLInputElement>('#tabSearch')) $<HTMLInputElement>('#tabSearch')!.value = '';
      syncSearchUI($('#tabSearchWrap'), $<HTMLInputElement>('#tabSearch'));
      renderSubmodules();
    } else if (action === 'refresh-statistics') {
      if (state.repo) void loadStatistics(state.repo.path);
    } else if (action === 'download-statistics') {
      void downloadStatisticsReport();
    }
  });

  document.addEventListener('keydown', (event) => {
    const modalOpen = $<HTMLElement>('#settingsBackdrop')!?.classList.contains('is-open');
    const aboutOpen = $<HTMLElement>('#aboutBackdrop')!?.classList.contains('is-open');
    const branchOpen = $<HTMLElement>('#branchBackdrop')!?.classList.contains('is-open');
    const actionOpen = $<HTMLElement>('#commitActionBackdrop')!?.classList.contains('is-open');
    const menu = $<HTMLElement>('#commitMenu');
    const menuOpen = !!menu && !menu.hidden;
    if (event.key === 'Escape') {
      if (menuOpen) {
        event.preventDefault();
        closeCommitMenu();
        return;
      }
      if (actionOpen) {
        event.preventDefault();
        closeCommitActionModal();
        return;
      }
      if (branchOpen) {
        event.preventDefault();
        closeBranchModal();
        return;
      }
      if (aboutOpen) {
        event.preventDefault();
        closeAbout();
        return;
      }
      if (modalOpen) {
        event.preventDefault();
        closeSettings();
        return;
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      if (actionOpen) {
        event.preventDefault();
        void confirmCommitAction();
      } else if (branchOpen) {
        event.preventDefault();
        void createBranchFromModal();
      } else if (modalOpen) {
        event.preventDefault();
        saveSettings();
      } else if (state.activeTab === 'files' && state.repo) {
        event.preventDefault();
        commitChanges();
      }
    }
  });

  window.addEventListener('focus', () => {
    if (!state.repo || state.loadingRepo || document.hidden) return;
    const now = Date.now();
    if (now - state.lastFocusRefresh < 5000) return;
    state.lastFocusRefresh = now;
    refreshRepo({ silent: true });
  });
}

/* ============================================================
   Start
   ============================================================ */
boot();
