import './app.css';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import { mountPreview } from './preview';
import {
  cachedLanguage,
  isChinese,
  LANGUAGE_STORAGE_KEY,
  normalizeLanguage,
  setI18nLanguage,
  startI18nObserver,
  translateUI
} from './i18n';
import type { GitGlanceApi, MenuAction } from '../electron/shared/ipc';
import type {
  AppSettings,
  AutoFetchInterval,
  Bootstrap,
  GitCommit,
  GitStatusFile,
  Language,
  LlmApiType,
  LlmSettings,
  PiEvent,
  PreviewData,
  PullStrategy,
  RepoSnapshot,
  RepoSummary,
  SettingsInput,
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

function crumbsFor(repoPath: string | null | undefined): string {
  const display = displayPath(repoPath);
  return display.split('/').filter(Boolean).map((part, index, array) =>
    `<span class="crumb${index === array.length - 1 ? ' last' : ''}">${esc(part)}</span>`
  ).join('<span class="path-sep">/</span>');
}

function relativeTimeFromCommit(commit: GitCommit | null | undefined): string {
  return commit?.when || timeAgo(commit?.timestamp ? new Date(commit.timestamp * 1000).toISOString() : null);
}

/* ============================================================
   State
   ============================================================ */
const state: AppState = {
  repos: [],
  activeRepo: null,
  repo: null,
  repoError: null,
  activeTab: 'files',
  paneMode: 'preview',
  chatPaneMode: 'preview',
  selectedFile: null,
  chatSelectedFile: null,
  fileQuery: '',
  historyQuery: '',
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
  appVersion: ''
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
function updateLanguageControls(value: unknown): void {
  const next = normalizeLanguage(value);
  $$('#languageMode button').forEach((button) => {
    const active = button.dataset.value === next;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const hint = $('#setLanguageHint');
  if (hint) {
    hint.textContent = isChinese()
      ? '立即应用到整个应用。'
      : 'Applied immediately and saved to app preferences.';
  }
}

function applyLanguage(value: unknown, { remember = true }: { remember?: boolean } = {}): void {
  const next = normalizeLanguage(value);
  state.language = next;
  state.settings = { ...state.settings, language: next };
  setI18nLanguage(next);
  if (remember) {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* localStorage can be unavailable; the config file remains the source of truth */
    }
  }
  updateThemeControls(state.settings.theme || state.themeMode);
  updateLanguageControls(next);
}

applyLanguage(cachedLanguage(), { remember: false });
startI18nObserver();

let languageRequestSeq = 0;

async function chooseLanguage(value: unknown): Promise<void> {
  const next = normalizeLanguage(value);
  const previous = normalizeLanguage(state.settings.language || state.language);
  if (next === previous) {
    updateLanguageControls(next);
    return;
  }
  applyLanguage(next, { remember: false });
  updateLanguageControls(next);
  if (!api) return;
  const requestId = ++languageRequestSeq;
  try {
    const saved = await api.setLanguage(next);
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

function pickChatFile(repo: RepoState | null): string | null {
  const files = repo?.files || [];
  return (files.find((file) => file.staged) || files[0] || null)?.path || null;
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

function dominantLanguage(repo: RepoState | null): { name: string; color: string } {
  if (!repo) return { name: 'Git', color: '#7c9cff' };
  const counts = new Map<string, number>();
  for (const entry of repoEntries(repo)) {
    if (entry.kind !== 'file') continue;
    const ext = extensionOf(entry.path);
    if (!ext) continue;
    counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  let best: { ext: string; count: number } | null = null;
  for (const [ext, count] of counts) {
    if (!best || count > best.count) best = { ext, count };
  }
  const language = best ? LANGUAGE_BY_EXT[best.ext] : null;
  return language || { name: 'Git', color: '#7c9cff' };
}

function activityFor(repo: RepoState | null): number[] {
  const buckets = Array<number>(12).fill(0);
  if (!repo?.history?.length) return buckets;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const commit of repo.history) {
    if (!commit.timestamp) continue;
    const date = new Date(commit.timestamp * 1000);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const daysAgo = Math.floor((todayStart - dayStart) / 86_400_000);
    if (daysAgo >= 0 && daysAgo < 12) buckets[11 - daysAgo] += 1;
  }
  return buckets;
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
  applyTheme(state.settings.theme || 'dark');
  applyLanguage(state.settings.language || 'en');
  const versionBadge = $('#appVersionBadge');
  if (versionBadge && state.appVersion) versionBadge.textContent = `v${state.appVersion}`;
  updateUserUI();
  renderProjectList();
  renderSidebarMeta();
  scheduleAutoFetch();
}

async function loadRepo(repoPath: string | null | undefined, { initial = false }: { initial?: boolean } = {}): Promise<void> {
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
    state.repoError = null;
    document.body.classList.remove('no-repo');
    mergeSummaryFromSnapshot(snapshot);

    state.selectedFile = pickTreeFile(state.repo);
    state.paneMode = 'preview';
    state.treeExpanded = new Set<string>();
    expandTreeAncestors(state.selectedFile);
    state.chatSelectedFile = pickChatFile(state.repo);
    state.chatPaneMode = 'preview';
    state.fileQuery = '';
    state.historyQuery = '';

    state.loadingRepo = false;
    syncCommitInput(true);
    renderAll();
    syncChatInput(true);

    if (state.activeTab === 'chat' && state.chatSelectedFile) renderDetail('chat');
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
      context.innerHTML = `
        <span class="wc-name">${esc(summary.name)}</span>
        <span class="wc-slash">/</span>
        <span class="wc-branch">${icon('branch')}${esc(summary.branch || '—')}</span>`;
    } else {
      context.innerHTML = `<span class="wc-name">GitGlance</span><span class="wc-slash">/</span><span class="wc-branch">No repository</span>`;
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
  const stats = {
    total: repo.files.length,
    staged: repo.files.filter((file) => file.staged).length,
    unstaged: repo.files.filter((file) => !file.staged).length,
    adds: repo.files.reduce((sum, file) => sum + (file.add || 0), 0),
    dels: repo.files.reduce((sum, file) => sum + (file.del || 0), 0)
  };
  const head = repo.history[0] || null;
  const language = dominantLanguage(repo);
  const activity = activityFor(repo);
  const maxActivity = Math.max(...activity, 1);
  const spark = activity.some(Boolean)
    ? activity.map((value) => `<i style="height:${Math.max(16, Math.round((value / maxActivity) * 100))}%"></i>`).join('')
    : '';
  const stagePct = stats.total ? Math.round((stats.staged / stats.total) * 100) : 0;
  const sync = [];
  if (repo.upstream) {
    if (repo.ahead) sync.push(`<span class="ahead">${icon('arrow-up')}${repo.ahead} ahead</span>`);
    if (repo.behind) sync.push(`<span class="behind">${icon('arrow-down')}${repo.behind} behind</span>`);
    if (!repo.ahead && !repo.behind) sync.push(`<span class="synced">${icon('check')}up to date</span>`);
  } else {
    sync.push(`<span class="behind">${icon('alert')}no upstream</span>`);
  }
  const upstreamSync = repo.upstream
    ? `${repo.ahead ? `<span class="ua">${icon('arrow-up')}${repo.ahead} ahead</span>` : ''}
       ${repo.behind ? `<span class="ub">${icon('arrow-down')}${repo.behind} behind</span>` : ''}
       ${!repo.ahead && !repo.behind ? `<span class="uc">${icon('check')}up to date</span>` : ''}`
    : `<span class="ub">${icon('alert')}No upstream configured</span>`;
  const busy = state.busyAction;
  const canFetch = repo.remotes?.length > 0 && !busy;
  const canPull = !!repo.upstream && !busy;
  const canPush = !!repo.upstream && repo.ahead > 0 && !busy;
  const headMeta = head
    ? `${esc(head.author)}<span class="sep">·</span><span class="hash">${esc((head.sha || '').slice(0, 7))}</span><span class="sep">·</span>${esc(relativeTimeFromCommit(head))}`
    : 'No commits yet';

  const summaryRoot = $('#summaryRoot');
  if (!summaryRoot) return;
  summaryRoot.innerHTML = `
    <div class="summary-top">
      <div class="summary-id">
        <div class="path-line">
          ${crumbsFor(repo.path)}
          <button class="copy-btn" data-action="copy-path" title="Copy repository path" aria-label="Copy repository path">${icon('copy')}</button>
        </div>
        <div class="title-row">
          <h1>${esc(repo.name)}</h1>
          <span class="chip">${icon(repo.remotes?.length ? 'cloud' : 'laptop')}${repo.remotes?.length ? 'Remote' : 'Local'}</span>
          <span class="lang"><span class="lang-dot" style="--lang-color:${language.color}"></span>${esc(language.name)}</span>
        </div>
        <div class="branch-line">
          <span class="branch-pill">${icon('branch')}${esc(repo.branch)}</span>
          <span class="sync-pair">${sync.join('')}</span>
          ${repo.upstream ? `<span class="remote">${icon('cloud')}${esc(repo.upstream)}</span>` : `<span class="remote">${icon('cloud')}no upstream</span>`}
          <span class="meta-sep"></span>
          <span class="fetch-time">fetched ${esc(timeAgo(repo.lastFetch))}</span>
        </div>
      </div>

      <div class="summary-commit" title="${head ? esc(head.message) : 'No commits yet'}">
        <div class="sc-label">${icon('git-commit')}Latest commit</div>
        <div class="sc-body">
          ${avatarHTML(head ? head.author : state.currentUser.name)}
          <div class="sc-copy">
            <div class="sc-msg">${head ? esc(head.message) : 'No commits yet'}</div>
            <div class="sc-meta">${headMeta}</div>
          </div>
        </div>
      </div>

      <div class="summary-actions">
        <button class="btn ghost icon-only" data-action="refresh" title="Refresh repository" aria-label="Refresh repository"${busy ? ' disabled' : ''}>${icon('refresh', busy === 'refresh' ? 'spin' : '')}</button>
        <button class="btn ghost" data-action="fetch"${canFetch ? '' : ' disabled'} title="${repo.remotes?.length ? 'Fetch all remotes' : 'No remote configured'}">${icon('refresh', busy === 'fetch' ? 'spin' : '')}Fetch</button>
        <button class="btn ghost" data-action="pull"${canPull ? '' : ' disabled'} title="${repo.upstream ? 'Pull from upstream' : 'No upstream configured'}">${icon('download')}Pull${repo.behind ? `<span class="count">${repo.behind}</span>` : ''}</button>
        <button class="btn primary" data-action="push"${canPush ? '' : ' disabled'} title="${repo.upstream ? 'Push to upstream' : 'No upstream configured'}">${icon('upload')}Push${repo.ahead ? `<span class="count">${repo.ahead}</span>` : ''}</button>
      </div>
    </div>

    <div class="summary-strip">
      <div class="strip-section">
        <div class="tile-label">${icon('file-code')}Working tree</div>
        ${stats.total ? `
          <div class="strip-main"><span class="stat-big">${stats.total}</span><span class="stat-unit">${stats.total === 1 ? 'file changed' : 'files changed'}</span></div>
          <span class="stat-diff"><span class="add">+${stats.adds}</span><span class="del">−${stats.dels}</span></span>
          <span class="stage-bar inline"><i style="width:${stagePct}%"></i></span>
          <span class="strip-foot">${stats.staged} staged · ${stats.unstaged} unstaged</span>
        ` : `<span class="clean-note">${icon('check')}Working tree clean</span>`}
      </div>
      <div class="strip-section">
        <div class="tile-label">${icon('cloud')}Upstream</div>
        <div class="upstream-sync">${upstreamSync}</div>
        <span class="strip-foot">${repo.upstream ? `${esc(repo.upstream)} · fetched ${esc(timeAgo(repo.lastFetch))}` : 'Add a remote to push and pull'}</span>
        <span class="spark">${spark}</span>
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
  $('#historyPanel')?.classList.toggle('is-active', state.activeTab === 'history');

  const chatActive = state.activeTab === 'chat';
  const tools = $('#tabsTools');
  if (tools) tools.hidden = chatActive;
  if (!chatActive) {
    const search = $<HTMLInputElement>('#tabSearch');
    if (search) {
      search.value = state.activeTab === 'files' ? state.fileQuery : state.historyQuery;
      search.placeholder = state.activeTab === 'files' ? 'Filter files…' : 'Search commits, authors…';
      search.setAttribute('aria-label', state.activeTab === 'files' ? 'Filter files' : 'Search commits and authors');
      syncSearchUI($('#tabSearchWrap'), search);
    }
  }
  updateFilesBadge();
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
   History
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
  let cls = 'ref-branch';
  if (ref.startsWith('origin/') || ref.includes('/')) cls = 'ref-remote';
  if (/^v\d/i.test(ref)) cls = 'ref-tag';
  return `<span class="ref-pill ${cls}">${esc(ref)}</span>`;
}

function renderHistory(): void {
  if (!state.repo) return;
  const repo = state.repo;
  const list = $('#historyList');
  if (!list) return;
  const rows = computeGraph(repo.history);
  const query = state.historyQuery.trim().toLowerCase();
  const items = repo.history.map((commit, index) => ({ commit, row: rows[index] })).filter(({ commit }) => {
    if (!query) return true;
    return `${commit.message} ${commit.author} ${commit.sha || ''}`.toLowerCase().includes(query);
  });

  if (!repo.history.length) {
    list.innerHTML = `<div class="empty-list history-empty">
      <span class="e-icon">${icon('git-commit')}</span>
      <h4>No commits yet</h4>
      <p>Make the first commit in this repository and its history will appear here.</p>
    </div>`;
    return;
  }
  if (!items.length) {
    list.innerHTML = `<div class="empty-list history-empty">
      <span class="e-icon">${icon('search')}</span>
      <h4>No commits found</h4>
      <p>Nothing matches “${esc(state.historyQuery.trim())}” in this repository.</p>
      <button class="btn ghost sm" data-action="clear-history">Clear search</button>
    </div>`;
    return;
  }

  list.innerHTML = items.map(({ commit, row }) => {
    const head = commit === repo.history[0];
    const refs = (commit.refs || []).map(refPill).join('');
    const [add, del] = commit.stats || [0, 0];
    const stats = add || del
      ? `<span class="add">+${add}</span><span class="del">−${del}</span>`
      : '<span class="none">—</span>';
    return `<div class="commit-row">
      <div class="graph-cell">${graphSVG(row, head, commit, !!query)}</div>
      <div class="commit-main">
        <div class="commit-msg-line">
          ${refs ? `<span class="refs">${refs}</span>` : ''}
          <span class="commit-msg" title="${esc(commit.message)}">${esc(commit.message)}</span>
        </div>
        <div class="commit-meta-line">
          ${avatarHTML(commit.author, 'avatar-xs')}
          <span class="commit-author">${esc(commit.author)}</span>
          ${commit.merge ? `<span class="sep">·</span><span class="merge-badge">${icon('git-merge')}merge</span>` : ''}
        </div>
      </div>
      <button class="commit-hash" data-copy-sha="${esc(commit.sha)}" title="Copy commit SHA">${esc((commit.sha || '').slice(0, 7))}</button>
      <div class="commit-stats">${stats}</div>
      <div class="commit-when" title="${esc(commit.when || '')}">${esc(commit.when || '')}</div>
    </div>`;
  }).join('');
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
    row.innerHTML = `
      <span class="chat-context-chip">${icon('branch')}${esc(repo.branch)}</span>
      <span class="chat-context-chip">${icon('git-commit')}${files} changed</span>
      <span class="chat-context-chip">${icon('check')}${staged} staged</span>`;
  }
  const input = $<HTMLTextAreaElement>('#chatInput');
  if (input) input.placeholder = `Ask about ${repo.name}…`;
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
function chatChangeRow(file: GitStatusFile): string {
  const slash = file.path.lastIndexOf('/');
  const dir = slash >= 0 ? file.path.slice(0, slash + 1) : '';
  const base = slash >= 0 ? file.path.slice(slash + 1) : file.path;
  const selected = state.chatSelectedFile === file.path;
  return `<div class="chat-change-row${selected ? ' is-selected' : ''}" data-chat-file="${esc(file.path)}" title="${esc(file.path)}">
    <button class="stage-check${file.staged ? ' checked' : ''}" data-stage="${esc(file.path)}" aria-pressed="${file.staged}" aria-label="${file.staged ? 'Unstage' : 'Stage'} ${esc(file.path)}" title="${file.staged ? 'Unstage file' : 'Stage file'}">${icon('check')}</button>
    <span class="status-badge status-${file.status}${file.staged ? ' is-staged' : ''}" title="${statusName(file.status)}${file.staged ? ' · staged' : ''}">${file.status}</span>
    <span class="chat-file-path"><span class="dir">${esc(dir)}</span>${esc(base)}</span>
    <span class="file-diff">${file.binary
      ? '<span class="diff-del">binary</span>'
      : `${file.add ? `<span class="diff-add">+${file.add}</span>` : ''}${file.del ? `<span class="diff-del">−${file.del}</span>` : ''}`}</span>
  </div>`;
}

function chatGroupHTML(label: string, kind: 'staged' | 'unstaged', files: GitStatusFile[]): string {
  if (!files.length) return '';
  return `<div class="group">
    <div class="group-head">
      <span class="g-dot ${kind}"></span>
      <span class="group-title">${label}</span>
      <span class="group-count">${files.length}</span>
      <button class="group-action" data-stage-group="${kind}">${kind === 'staged' ? 'Unstage all' : 'Stage all'}</button>
    </div>
    ${files.map(chatChangeRow).join('')}
  </div>`;
}

function renderChatSide(): void {
  if (!state.repo) return;
  const repo = state.repo;
  const files = repo.files;
  const staged = files.filter((file) => file.staged).sort((a, b) => a.path.localeCompare(b.path));
  const unstaged = files.filter((file) => !file.staged).sort((a, b) => a.path.localeCompare(b.path));
  const side = $('#chatSide');
  const head = $('#chatSideHead');
  const changes = $('#chatChanges');
  const detail = $('#chatDetail');
  if (!side || !head || !changes) return;
  const previousScroll = changes.scrollTop;
  const pct = files.length ? Math.round((staged.length / files.length) * 100) : 0;

  head.innerHTML = `<div class="csh-row">
    <div class="csh-title">${icon('git-commit')}<span class="eyebrow">Changed content</span><span class="csh-count">${files.length}</span></div>
    <div class="csh-actions">
      <button class="csh-open" data-action="open-worktree" title="Open full worktree">${icon('folder')}Worktree</button>
    </div>
  </div>
  <div class="csh-meta"><span class="g-dot staged"></span>${staged.length} staged<span class="g-dot unstaged"></span>${unstaged.length} unstaged</div>
  <div class="chat-stage-bar"><i style="width:${pct}%"></i></div>`;

  side.classList.toggle('is-empty', files.length === 0);
  if (!files.length) {
    state.chatSelectedFile = null;
    changes.innerHTML = `<div class="chat-side-empty">
      <span class="e-icon">${icon('check')}</span>
      <h4>Working tree clean</h4>
      <p>There are no staged or unstaged files in ${esc(repo.name)} right now.</p>
    </div>`;
    if (detail) detail.innerHTML = '';
    return;
  }

  if (!state.chatSelectedFile || !files.some((file) => file.path === state.chatSelectedFile)) {
    state.chatSelectedFile = pickChatFile(repo);
    state.chatPaneMode = 'preview';
  }

  changes.innerHTML = chatGroupHTML('Staged', 'staged', staged) + chatGroupHTML('Changes', 'unstaged', unstaged);
  changes.scrollTop = previousScroll;
  renderChatHead();

  if (state.activeTab === 'chat') renderDetail('chat');
}

function selectChatFile(filePath: string): void {
  if (!state.repo) return;
  if (!state.repo.files.some((file) => file.path === filePath)) {
    toast('That file is no longer part of the working tree', 'info');
    return;
  }
  state.chatSelectedFile = filePath;
  state.chatPaneMode = 'preview';
  expandTreeAncestors(filePath);
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

function detailHeadHTML(entry: RepoEntry, change: GitStatusFile | null): string {
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
    </span>
  </div>`;
}

function linkDetailHTML(entry: RepoEntry, change: GitStatusFile | null): string {
  const path = entry.path;
  return `${detailHeadHTML(entry, change)}
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

function detailShellHTML(entry: RepoEntry, change: GitStatusFile | null, mode: PaneMode): string {
  const canDiff = canDiffEntry(entry, change);
  const safeMode = mode === 'diff' && canDiff ? 'diff' : 'preview';
  const modeChip = change ? (change.staged ? 'Staged' : 'Working tree') : 'Clean';
  const context = safeMode === 'preview' ? 'current contents' : `compared to ${change?.staged ? 'HEAD' : 'index'}`;
  const kind = safeMode === 'preview' ? 'Loading preview…' : 'Loading diff…';
  const switchHTML = `<div class="pane-switch" role="group" aria-label="File view">
    <button type="button" data-pane-mode="preview" class="${safeMode === 'preview' ? 'is-active' : ''}" aria-pressed="${safeMode === 'preview'}">${icon('file-code')}Preview</button>
    <button type="button" data-pane-mode="diff" class="${safeMode === 'diff' ? 'is-active' : ''}" aria-pressed="${safeMode === 'diff'}"${canDiff ? '' : ' disabled title="No text diff available for this file"'}>${icon('git-commit')}Changes</button>
  </div>`;
  return `${detailHeadHTML(entry, change)}
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
    container.innerHTML = linkDetailHTML(entry, change);
    return;
  }

  container.innerHTML = detailShellHTML(entry, change, activeMode);
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
    mergeSummaryFromSnapshot(snapshot);
    repoEntries(state.repo);
    if (previousSelected && state.repo._entryMap?.has(previousSelected)) state.selectedFile = previousSelected;
    else state.selectedFile = pickTreeFile(state.repo);
    if (previousChatSelected && state.repo.files.some((file) => file.path === previousChatSelected)) state.chatSelectedFile = previousChatSelected;
    else state.chatSelectedFile = pickChatFile(state.repo);
    renderAll();
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
  renderHistory();
  renderChat();
  updateCommitBar();
}

/* ============================================================
   Settings
   ============================================================ */
let lastFocusedElement: HTMLElement | null = null;

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
  updateLanguageControls(normalizeLanguage(settings.language || state.language));
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
    language: normalizeLanguage(activeLanguage?.dataset.value || state.settings.language),
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
    renderDetail('chat');
  }
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
    } else if (state.activeTab === 'history') {
      state.historyQuery = tabSearch.value;
      renderHistory();
    }
    syncSearchUI($('#tabSearchWrap'), tabSearch);
  });
  $('#tabSearchClear')?.addEventListener('click', () => {
    if (!tabSearch) return;
    if (state.activeTab === 'files') {
      state.fileQuery = '';
      renderFileTree();
    } else if (state.activeTab === 'history') {
      state.historyQuery = '';
      renderHistory();
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
    const row = eventTarget(event)?.closest<HTMLElement>('[data-chat-file]');
    if (row) selectChatFile(row.dataset.chatFile || '');
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

  const chatInput = $<HTMLTextAreaElement>('#chatInput');
  chatInput?.addEventListener('input', () => {
    if (!state.repo) return;
    getChat(state.repo.path).draft = chatInput.value;
    resizeChatInput();
    syncChatComposer();
  });
  chatInput?.addEventListener('keydown', (event) => {
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

  $('#historyList')?.addEventListener('click', (event) => {
    const hash = eventTarget(event)?.closest<HTMLElement>('[data-copy-sha]');
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
  $<HTMLElement>('#settingsBackdrop')!?.addEventListener('click', (event) => {
    if (event.target === $<HTMLElement>('#settingsBackdrop')!) closeSettings();
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
    if (action === 'open-repo') openRepository();
    else if (action === 'retry-repo') loadRepo(state.activeRepo || state.repos[0]?.path, { initial: false });
    else if (action === 'refresh') refreshRepo({ spinner: true });
    else if (action === 'fetch') runRepoAction('fetch');
    else if (action === 'pull') runRepoAction('pull');
    else if (action === 'push') runRepoAction('push');
    else if (action === 'copy-path') {
      if (state.repo) copyText(state.repo.path, 'Repository path copied to clipboard');
    } else if (action === 'open-settings') openSettings();
    else if (action === 'open-worktree') openWorktreeFromChat();
    else if (action === 'clear-files') {
      state.fileQuery = '';
      if ($<HTMLInputElement>('#tabSearch')) $<HTMLInputElement>('#tabSearch')!.value = '';
      syncSearchUI($('#tabSearchWrap'), $<HTMLInputElement>('#tabSearch'));
      renderFileTree();
    } else if (action === 'clear-history') {
      state.historyQuery = '';
      if ($<HTMLInputElement>('#tabSearch')) $<HTMLInputElement>('#tabSearch')!.value = '';
      syncSearchUI($('#tabSearchWrap'), $<HTMLInputElement>('#tabSearch'));
      renderHistory();
    }
  });

  document.addEventListener('keydown', (event) => {
    const modalOpen = $<HTMLElement>('#settingsBackdrop')!?.classList.contains('is-open');
    if (event.key === 'Escape' && modalOpen) {
      event.preventDefault();
      closeSettings();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      if (modalOpen) {
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
