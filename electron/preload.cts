import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type {
  Bootstrap,
  CommitResult,
  PiAbortResult,
  PiEvent,
  PiResetResult,
  PiSendResult,
  PreviewData,
  PullStrategy,
  RepoSnapshot,
  FileDiff,
  SettingsInput,
  ThemeMode,
  Language
} from './shared/models.js';
import type {
  FetchOptions,
  GitGlanceApi,
  IpcEnvelope,
  MenuAction,
  OpenRepositoryResult,
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
  openExternal: (url) => call<true>('app:open-external', url),
  saveSettings: (settings: SettingsInput) => call<SaveSettingsResult>('settings:save', settings),
  setTheme: (theme: ThemeMode) => call<ThemeMode>('settings:theme', theme),
  setLanguage: (language: Language) => call<Language>('settings:language', language),
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
