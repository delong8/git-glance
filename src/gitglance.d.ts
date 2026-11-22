import type { GitGlanceApi } from '../electron/shared/ipc';

declare global {
  interface Window {
    gitglance?: GitGlanceApi;
  }
}

export {};
