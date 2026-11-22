import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import type {
  LlmSettings,
  PiAbortResult,
  PiEvent,
  PiResetResult,
  PiSendResult,
  PiStatus
} from '../shared/models.js';

export const PI_SYSTEM_PROMPT = `You are GitGlance AI, an assistant embedded in a local Git desktop client.
Help the user understand the current working tree, review code changes, explain Git concepts, and draft commit messages.
You have read-only repository tools: read, grep, find, and ls. The process working directory is the repository root.
Never modify files. Never run shell commands. Use the supplied repository context and tools when useful.
Keep answers concise, concrete, and formatted as Markdown. Refer to files with relative paths in backticks.`;

export function resolvePiBinary(): string | null {
  if (process.env.PI_BIN && fs.existsSync(process.env.PI_BIN)) return process.env.PI_BIN;
  const candidates = [
    '/opt/homebrew/bin/pi',
    '/usr/local/bin/pi',
    '/usr/bin/pi',
    path.join(process.env.HOME || '', '.local', 'bin', 'pi'),
    path.join(process.env.HOME || '', '.npm-global', 'bin', 'pi')
  ];
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, 'pi');
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

interface PiContentBlock {
  type?: string;
  text?: string;
}

interface PiAssistantEvent {
  type?: string;
  delta?: string;
  content?: string;
  toolName?: string;
  error?: unknown;
  reason?: string;
}

interface PiRpcRecord {
  type?: string;
  success?: boolean;
  error?: string;
  command?: string;
  id?: string;
  assistantMessageEvent?: PiAssistantEvent;
  toolName?: string;
  args?: unknown;
  isError?: boolean;
  message?: {
    role?: string;
    content?: unknown;
  };
  aborted?: boolean;
  attempt?: number;
  maxAttempts?: number;
}

interface PiSession {
  repoPath: string;
  child: ChildProcessWithoutNullStreams;
  buffer: string;
  active: boolean;
  promptId: string | null;
  streamText: string;
  finalText: string;
  assistantParts: string[];
  stderr: string;
  closing: boolean;
  startedAt: number;
}

export interface PiServiceOptions {
  onEvent?: (event: PiEvent) => void;
  /** GitGlance-owned Pi config directory; the user's ~/.pi is never read. */
  agentDir: string;
  llm: LlmSettings;
}

export class PiService {
  readonly bin: string | null;
  readonly agentDir: string;
  private readonly onEvent: (event: PiEvent) => void;
  private readonly sessions: Map<string, PiSession>;
  private llm: LlmSettings;
  private shuttingDown: boolean;

  constructor({ onEvent, agentDir, llm }: PiServiceOptions) {
    this.bin = resolvePiBinary();
    this.agentDir = agentDir;
    this.llm = { ...llm };
    this.onEvent = onEvent || (() => {});
    this.sessions = new Map();
    this.shuttingDown = false;
  }

  isAvailable(): boolean {
    return !!this.bin && this.isLlmConfigured();
  }

  isLlmConfigured(): boolean {
    return !!(this.llm.provider && this.llm.baseUrl && this.llm.model);
  }

  getStatus(): PiStatus {
    const configured = this.isLlmConfigured();
    let error: string | null = null;
    if (!this.bin) {
      error = 'The Pi agent binary was not found. Install pi or set PI_BIN.';
    } else if (!configured) {
      error = 'Configure an LLM provider in Settings to use Pi chat.';
    }
    return {
      available: !!this.bin && configured,
      binary: this.bin,
      configured,
      provider: configured ? this.llm.provider : null,
      model: configured ? this.llm.model : null,
      error
    };
  }

  /**
   * Adopt new provider settings, rewrite the app-managed Pi config, and drop
   * running sessions so the next prompt starts with the new model.
   */
  setLlmSettings(settings: LlmSettings): void {
    this.llm = { ...settings };
    this.writeAgentConfig();
    for (const repoPath of [...this.sessions.keys()]) this.reset(repoPath);
  }

  private writeAgentConfig(): void {
    const modelsFile = path.join(this.agentDir, 'models.json');
    const settingsFile = path.join(this.agentDir, 'settings.json');
    if (!this.isLlmConfigured()) {
      try { fs.rmSync(modelsFile, { force: true }); } catch { /* ignore */ }
      try { fs.rmSync(settingsFile, { force: true }); } catch { /* ignore */ }
      return;
    }
    const provider: Record<string, unknown> = {
      baseUrl: this.llm.baseUrl,
      api: this.llm.api,
      models: [{ id: this.llm.model }]
    };
    if (this.llm.apiKey) provider.apiKey = this.llm.apiKey;
    const models = {
      $schema: 'https://pi.dev/schemas/models.schema.json',
      providers: { [this.llm.provider]: provider }
    };
    const settings = {
      defaultProvider: this.llm.provider,
      defaultModel: this.llm.model,
      // Never load repository-local .pi configuration; the app-owned provider
      // config above is the only source of model settings.
      defaultProjectTrust: 'never'
    };
    try {
      fs.mkdirSync(this.agentDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(modelsFile, `${JSON.stringify(models, null, 2)}\n`, { mode: 0o600 });
      fs.writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not write the Pi provider config to ${this.agentDir}: ${message}`);
    }
  }

  private emit(event: PiEvent): void {
    try {
      this.onEvent(event);
    } catch {
      /* ignore renderer errors */
    }
  }

  private spawnSession(repoPath: string): PiSession {
    const bin = this.bin;
    if (!bin) throw new Error('Pi agent is not available. Install pi or set PI_BIN.');
    if (!this.isLlmConfigured()) {
      throw new Error('Configure an LLM provider in Settings to use Pi chat.');
    }
    // Keep the provider config in sync even if the files were removed or the
    // app started with an older config.
    this.writeAgentConfig();
    const key = path.resolve(repoPath);
    const args = [
      '--mode', 'rpc',
      '--no-session',
      '--no-extensions',
      '--no-mcp',
      '--no-skills',
      '--no-context-files',
      '--no-prompt-templates',
      '--no-themes',
      '--no-approve',
      '--provider', this.llm.provider,
      '--model', this.llm.model,
      '--tools', 'read,grep,find,ls',
      '--append-system-prompt', PI_SYSTEM_PROMPT
    ];
    const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      // GitGlance owns the Pi agent directory, so ~/.pi/agent is never read.
      PI_CODING_AGENT_DIR: this.agentDir,
      GIT_TERMINAL_PROMPT: '0',
      PATH: [...new Set([...(process.env.PATH || '').split(path.delimiter), ...extraPaths].filter(Boolean))].join(path.delimiter)
    };
    const child = spawn(bin, args, {
      cwd: key,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    }) as ChildProcessWithoutNullStreams;

    const session: PiSession = {
      repoPath: key,
      child,
      buffer: '',
      active: false,
      promptId: null,
      streamText: '',
      finalText: '',
      assistantParts: [],
      stderr: '',
      closing: false,
      startedAt: Date.now()
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      session.buffer += chunk;
      let newline: number;
      while ((newline = session.buffer.indexOf('\n')) >= 0) {
        const line = session.buffer.slice(0, newline).replace(/\r$/, '');
        session.buffer = session.buffer.slice(newline + 1);
        if (!line.trim()) continue;
        this.handleLine(session, line);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      session.stderr += String(chunk);
      if (session.stderr.length > 16_000) session.stderr = session.stderr.slice(-16_000);
    });

    child.on('error', (error: Error) => {
      this.emit({ repoPath: key, type: 'error', message: `Pi agent failed to start: ${error.message}` });
      if (session.active) {
        session.active = false;
        this.emit({ repoPath: key, type: 'done', aborted: true });
      }
      this.sessions.delete(key);
    });

    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      session.active = false;
      this.sessions.delete(key);
      if (this.shuttingDown || session.closing) return;
      const details = session.stderr.trim();
      this.emit({
        repoPath: key,
        type: 'error',
        message: `Pi agent exited${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}${details ? `\n${details.split('\n').slice(-8).join('\n')}` : ''}`
      });
      this.emit({ repoPath: key, type: 'done', aborted: true });
    });

    this.sessions.set(key, session);
    return session;
  }

  private getSession(repoPath: string): PiSession {
    const key = path.resolve(repoPath);
    let session = this.sessions.get(key);
    if (!session) {
      if (!this.bin) throw new Error('Pi agent is not available. Install pi or set PI_BIN.');
      if (!this.isLlmConfigured()) throw new Error('Configure an LLM provider in Settings to use Pi chat.');
      session = this.spawnSession(key);
    }
    return session;
  }

  private handleLine(session: PiSession, line: string): void {
    if (session.closing) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    const record = parsed as PiRpcRecord;
    const repoPath = session.repoPath;

    if (record.type === 'response') {
      if (record.success === false) {
        this.emit({ repoPath, type: 'error', message: record.error || `Pi command failed: ${record.command || 'unknown'}` });
        if (session.active && (!record.id || record.id === session.promptId || record.command === 'prompt')) {
          session.active = false;
          session.promptId = null;
          this.emit({ repoPath, type: 'done', aborted: true });
        }
      }
      return;
    }

    if (record.type === 'message_update') {
      const event = record.assistantMessageEvent;
      if (!event) return;
      if (event.type === 'text_delta' && event.delta) {
        session.streamText += event.delta;
        this.emit({ repoPath, type: 'delta', delta: event.delta });
      } else if (event.type === 'text_end' && typeof event.content === 'string') {
        // Authoritative final content for this content block; keep streaming text
        // in sync without duplicating it in the UI.
      } else if (event.type === 'toolcall_start') {
        this.emit({ repoPath, type: 'tool', toolName: event.toolName || 'tool' });
      } else if (event.type === 'error') {
        this.emit({
          repoPath,
          type: 'error',
          message: typeof event.error === 'string' ? event.error : (event.reason || 'The Pi agent stream failed.')
        });
      }
      return;
    }

    if (record.type === 'tool_execution_start') {
      this.emit({ repoPath, type: 'tool', toolName: record.toolName || 'tool', args: record.args || null });
      return;
    }
    if (record.type === 'tool_execution_end') {
      this.emit({ repoPath, type: 'tool_done', toolName: record.toolName || 'tool', isError: !!record.isError });
      return;
    }

    if (record.type === 'message_end' && record.message && record.message.role === 'assistant') {
      const content = Array.isArray(record.message.content) ? record.message.content : [];
      const text = content
        .filter((block): block is PiContentBlock => !!block && typeof block === 'object')
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text || '')
        .join('');
      if (text) session.assistantParts.push(text);
      return;
    }

    if (record.type === 'agent_settled') {
      const text = session.assistantParts.join('\n\n').trim() || session.streamText.trim();
      session.active = false;
      session.promptId = null;
      this.emit({
        repoPath,
        type: 'done',
        aborted: !!record.aborted,
        text,
        durationMs: Date.now() - session.startedAt
      });
      session.streamText = '';
      session.finalText = '';
      session.assistantParts = [];
      return;
    }

    if (record.type === 'auto_retry_start') {
      this.emit({ repoPath, type: 'status', message: `Retrying (${record.attempt}/${record.maxAttempts})…` });
      return;
    }
    if (record.type === 'compaction_start') {
      this.emit({ repoPath, type: 'status', message: 'Compacting conversation context…' });
    }
  }

  send(repoPath: string, prompt: string): PiSendResult {
    const session = this.getSession(repoPath);
    if (session.active) {
      throw new Error('The Pi agent is still responding. Wait for it to finish or stop it first.');
    }
    const id = `gg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    session.active = true;
    session.promptId = id;
    session.streamText = '';
    session.assistantParts = [];
    session.startedAt = Date.now();
    this.emit({ repoPath: session.repoPath, type: 'start' });
    try {
      session.child.stdin.write(`${JSON.stringify({ id, type: 'prompt', message: prompt })}\n`);
    } catch (error) {
      session.active = false;
      session.promptId = null;
      const message = error instanceof Error ? error.message : String(error);
      this.emit({ repoPath: session.repoPath, type: 'error', message: `Could not talk to the Pi agent: ${message}` });
      this.emit({ repoPath: session.repoPath, type: 'done', aborted: true });
      throw error;
    }
    return { accepted: true, id };
  }

  abort(repoPath: string): PiAbortResult {
    const session = this.sessions.get(path.resolve(repoPath));
    if (!session || !session.active) return { aborted: false };
    try {
      session.child.stdin.write(`${JSON.stringify({ type: 'abort' })}\n`);
    } catch {
      /* process may be gone */
    }
    return { aborted: true };
  }

  reset(repoPath: string): PiResetResult {
    const key = path.resolve(repoPath);
    const session = this.sessions.get(key);
    if (!session) return { reset: true };
    session.closing = true;
    session.active = false;
    this.sessions.delete(key);
    try {
      session.child.stdin.end();
    } catch {
      /* ignore */
    }
    const killTimer = setTimeout(() => {
      try { session.child.kill('SIGKILL'); } catch { /* ignore */ }
    }, 800);
    killTimer.unref?.();
    return { reset: true };
  }

  close(repoPath: string): void {
    this.reset(repoPath);
  }

  shutdown(): void {
    this.shuttingDown = true;
    for (const repoPath of this.sessions.keys()) this.reset(repoPath);
  }
}
