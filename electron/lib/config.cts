import * as fs from 'node:fs/promises';
import path from 'node:path';
import {
  MAX_CUSTOM_PROMPT_LENGTH,
  MAX_CUSTOM_PROMPTS,
  MAX_SYSTEM_PROMPT_LENGTH
} from '../shared/models.js';
import type {
  AutoFetchInterval,
  LanguageMode,
  LlmApiType,
  LlmSettings,
  ThemeMode,
  UiSettings
} from '../shared/models.js';

export interface ConfigData {
  repos: string[];
  activeRepo: string | null;
  ui: UiSettings;
  llm: LlmSettings;
}

const AUTO_FETCH_INTERVALS: readonly AutoFetchInterval[] = ['off', '5', '15', '30', '60'];
const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];
const LANGUAGE_MODES: readonly LanguageMode[] = ['system', 'en', 'zh-CN'];
const LLM_API_TYPES: readonly LlmApiType[] = [
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'google-generative-ai',
  'google-vertex'
];

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  provider: '',
  api: 'openai-completions',
  baseUrl: '',
  apiKey: '',
  model: ''
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isAutoFetchInterval(value: unknown): value is AutoFetchInterval {
  return AUTO_FETCH_INTERVALS.includes(value as AutoFetchInterval);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODES.includes(value as ThemeMode);
}

export function isLanguageMode(value: unknown): value is LanguageMode {
  return LANGUAGE_MODES.includes(value as LanguageMode);
}

export function isLlmApiType(value: unknown): value is LlmApiType {
  return LLM_API_TYPES.includes(value as LlmApiType);
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;

/** Coerce a zoom factor into 0.5–3.0 (one decimal); null means 1.0. */
export function normalizeZoom(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
  return Math.round(clamped * 10) / 10;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Coerce a user system prompt into a trimmed, length-limited string. */
export function normalizeSystemPrompt(value: unknown): string {
  return text(value).replace(/\r\n/g, '\n').slice(0, MAX_SYSTEM_PROMPT_LENGTH);
}

/** Coerce custom chat prompts into trimmed, non-empty, length-limited strings. */
export function normalizeCustomPrompts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const prompts: string[] = [];
  for (const entry of value) {
    const prompt = text(entry).replace(/\r\n/g, '\n');
    if (!prompt) continue;
    prompts.push(prompt.slice(0, MAX_CUSTOM_PROMPT_LENGTH));
    if (prompts.length >= MAX_CUSTOM_PROMPTS) break;
  }
  return prompts;
}

/** Coerce unknown renderer/config input into a complete LLM provider record. */
export function normalizeLlmSettings(value: unknown): LlmSettings {
  const input = isRecord(value) ? value : {};
  return {
    provider: text(input.provider),
    api: isLlmApiType(input.api) ? input.api : DEFAULT_LLM_SETTINGS.api,
    baseUrl: text(input.baseUrl),
    apiKey: text(input.apiKey),
    model: text(input.model)
  };
}

/**
 * Small persistent store for the repositories list and app-only preferences.
 * Git configuration (identity, pull strategy, signing) is read/written through
 * the actual git CLI elsewhere; this file only stores UI state.
 */
export class ConfigStore {
  readonly dir: string;
  readonly file: string;
  private data: ConfigData;
  private saveQueue: Promise<void> = Promise.resolve();
  private saveSeq = 0;

  constructor(userDataDir: string) {
    this.dir = userDataDir;
    this.file = path.join(userDataDir, 'config.json');
    this.data = {
      repos: [],
      activeRepo: null,
      ui: {
        autoFetch: '15',
        fetchAll: false,
        theme: 'dark',
        language: 'en',
        zoom: null,
        systemPrompt: '',
        customPrompts: []
      },
      llm: { ...DEFAULT_LLM_SETTINGS }
    };
  }

  async load(): Promise<ConfigData> {
    await fs.mkdir(this.dir, { recursive: true });
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) {
        const repos = Array.isArray(parsed.repos)
          ? [...new Set(parsed.repos
            .filter((repo): repo is string => typeof repo === 'string' && repo.trim().length > 0)
            .map((repo) => path.resolve(repo)))]
          : [];
        const activeRepo = typeof parsed.activeRepo === 'string' && repos.includes(path.resolve(parsed.activeRepo))
          ? path.resolve(parsed.activeRepo)
          : repos[0] || null;
        const ui = isRecord(parsed.ui) ? parsed.ui : {};
        this.data = {
          repos,
          activeRepo,
          ui: {
            autoFetch: isAutoFetchInterval(ui.autoFetch) ? ui.autoFetch : '15',
            fetchAll: ui.fetchAll === true,
            theme: isThemeMode(ui.theme) ? ui.theme : 'dark',
            language: isLanguageMode(ui.language) ? ui.language : 'en',
            zoom: normalizeZoom(ui.zoom),
            systemPrompt: normalizeSystemPrompt(ui.systemPrompt),
            customPrompts: normalizeCustomPrompts(ui.customPrompts)
          },
          llm: normalizeLlmSettings(parsed.llm)
        };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Keep the app usable if the config was corrupted.
        try {
          await fs.rename(this.file, `${this.file}.broken-${Date.now()}`);
        } catch {
          /* ignore */
        }
      }
    }
    return this.data;
  }

  save(): Promise<void> {
    // Snapshot now, then serialize writes so rapid preference changes cannot
    // interleave or clobber each other through a shared temp file.
    const snapshot = JSON.stringify(this.data, null, 2);
    const seq = ++this.saveSeq;
    const write = this.saveQueue.then(async () => {
      await fs.mkdir(this.dir, { recursive: true });
      const tmp = `${this.file}.${process.pid}.${seq}.tmp`;
      // The config now holds the LLM API key, so keep it private to the user.
      await fs.writeFile(tmp, snapshot, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(tmp, this.file);
    });
    this.saveQueue = write.catch(() => {});
    return write;
  }

  getRepos(): string[] {
    return [...this.data.repos];
  }

  getActiveRepo(): string | null {
    return this.data.activeRepo;
  }

  getUiSettings(): UiSettings {
    return { ...this.data.ui };
  }

  getLlmSettings(): LlmSettings {
    return { ...this.data.llm };
  }

  async addRepo(repoPath: string): Promise<string[]> {
    const normalized = path.resolve(repoPath);
    if (!this.data.repos.includes(normalized)) {
      this.data.repos.push(normalized);
    }
    this.data.activeRepo = normalized;
    await this.save();
    return this.data.repos;
  }

  async removeRepo(repoPath: string): Promise<string[]> {
    const normalized = path.resolve(repoPath);
    this.data.repos = this.data.repos.filter((repo) => repo !== normalized);
    if (this.data.activeRepo === normalized) {
      this.data.activeRepo = this.data.repos[0] || null;
    }
    await this.save();
    return this.data.repos;
  }

  async setActiveRepo(repoPath: string | null): Promise<string | null> {
    if (repoPath && this.data.repos.includes(path.resolve(repoPath))) {
      this.data.activeRepo = path.resolve(repoPath);
      await this.save();
    }
    return this.data.activeRepo;
  }

  async updateUiSettings(partial: Partial<UiSettings>): Promise<UiSettings> {
    const next: UiSettings = {
      ...this.data.ui,
      ...partial
    };
    if ('systemPrompt' in partial) next.systemPrompt = normalizeSystemPrompt(partial.systemPrompt);
    if ('customPrompts' in partial) next.customPrompts = normalizeCustomPrompts(partial.customPrompts);
    this.data.ui = next;
    await this.save();
    return this.getUiSettings();
  }

  async updateLlmSettings(settings: LlmSettings): Promise<LlmSettings> {
    this.data.llm = normalizeLlmSettings(settings);
    await this.save();
    return this.getLlmSettings();
  }
}
