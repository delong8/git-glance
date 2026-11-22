import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import type {
  BranchInfo,
  CommitResult,
  DiffStat,
  FileDiff,
  GitCommit,
  GitGlobalConfig,
  GitRemote,
  GitStatusCode,
  GitStatusFile,
  GitTreeNode,
  PullStrategy,
  RepoSnapshot,
  RepoSummary
} from '../shared/models.js';

const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  LC_ALL: 'C',
  LANG: 'C',
  GIT_PAGER: 'cat',
  PAGER: 'cat',
  GIT_TERMINAL_PROMPT: '0',
  GIT_MERGE_AUTOEDIT: 'no'
};

export interface GitRunOptions {
  allowFailure?: boolean;
  maxBuffer?: number;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
  encoding?: 'utf8' | 'buffer';
}

export interface GitRunResult<TOutput extends string | Buffer = string> {
  stdout: TOutput;
  stderr: TOutput;
  code: number;
  durationMs: number;
  failed: boolean;
}

interface GitCommandError extends Error {
  code?: string | number;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  durationMs?: number;
}

export interface GitTreeResult {
  entries: GitTreeNode[];
  total: number;
  truncated: boolean;
}

export interface GitHeadFile {
  bytes: Buffer;
  text: string;
}

export interface GitConfigWriteInput {
  name: string;
  email: string;
  defaultBranch: string;
  editor: string;
  pullStrategy: PullStrategy;
  sign: boolean;
  gpgKey: string;
  prune: boolean;
}

export function isProbablyBinaryBuffer(buffer: Buffer | Uint8Array): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  if (sample.includes(0)) return true;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1;
  }
  return sample.length > 0 && suspicious / sample.length > 0.05;
}

function cleanError(error: unknown, fallback = 'Git command failed'): string {
  const gitError = error as Partial<GitCommandError> | null;
  const stderr = gitError?.stderr ? String(gitError.stderr).trim() : '';
  const stdout = gitError?.stdout ? String(gitError.stdout).trim() : '';
  const message = stderr || stdout || gitError?.message || fallback;
  return message.split('\n').slice(0, 30).join('\n');
}

export function runGit(
  repoPath: string,
  args: string[],
  options: GitRunOptions & { encoding: 'buffer' }
): Promise<GitRunResult<Buffer>>;
export function runGit(
  repoPath: string,
  args: string[],
  options?: GitRunOptions & { encoding?: 'utf8' }
): Promise<GitRunResult<string>>;
export function runGit(
  repoPath: string,
  args: string[],
  options: GitRunOptions = {}
): Promise<GitRunResult<string | Buffer>> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    execFile(
      'git',
      args,
      {
        cwd: repoPath,
        env: { ...GIT_ENV, ...(options.env || {}) },
        timeout: options.timeout || 30_000,
        maxBuffer: options.maxBuffer || 64 * 1024 * 1024,
        encoding: options.encoding || 'utf8',
        windowsHide: true
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - started;
        if (error) {
          if (options.allowFailure) {
            resolve({
              stdout,
              stderr,
              code: typeof error.code === 'number' ? error.code : 1,
              durationMs,
              failed: true
            });
            return;
          }
          const wrapped = new Error(cleanError(error)) as GitCommandError;
          wrapped.code = error.code ?? undefined;
          wrapped.stdout = stdout;
          wrapped.stderr = stderr;
          wrapped.durationMs = durationMs;
          reject(wrapped);
          return;
        }
        resolve({ stdout, stderr, code: 0, durationMs, failed: false });
      }
    );
  });
}

export async function normalizeRepo(inputPath: string): Promise<string> {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('No repository path provided');
  }
  const resolved = path.resolve(inputPath);
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new Error(`Repository folder not found: ${resolved}`);
  }
  if (!stat.isDirectory()) throw new Error('The selected path is not a folder');

  const inside = await runGit(resolved, ['rev-parse', '--show-toplevel'], { allowFailure: true });
  if (inside.failed) throw new Error('Not a Git repository (or the folder is outside a worktree)');
  const root = (inside.stdout || '').trim();
  if (!root) throw new Error('Not a Git repository');

  const bare = await runGit(root, ['rev-parse', '--is-bare-repository'], { allowFailure: true });
  if (!bare.failed && bare.stdout.trim() === 'true') {
    throw new Error('Bare repositories are not supported yet');
  }
  return fs.realpath(root);
}

export function validateRelativePath(repoPath: string, relativePath: string): string {
  if (!relativePath || typeof relativePath !== 'string') throw new Error('Missing file path');
  const absolute = path.resolve(repoPath, relativePath);
  const root = path.resolve(repoPath);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new Error('File path is outside the repository');
  }
  return absolute;
}

async function lastFetchTime(repoPath: string): Promise<string | null> {
  const result = await runGit(repoPath, ['rev-parse', '--git-common-dir'], { allowFailure: true });
  if (result.failed) return null;
  let gitDir = (result.stdout || '').trim();
  if (!gitDir) return null;
  if (!path.isAbsolute(gitDir)) gitDir = path.resolve(repoPath, gitDir);
  try {
    const stat = await fs.stat(path.join(gitDir, 'FETCH_HEAD'));
    return stat.mtime.toISOString();
  } catch {
    return null;
  }
}

async function getRemotes(repoPath: string): Promise<GitRemote[]> {
  const result = await runGit(repoPath, ['remote', '-v'], { allowFailure: true });
  if (result.failed) return [];
  const map = new Map<string, GitRemote>();
  for (const line of result.stdout.split('\n')) {
    const match = line.trim().match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!match) continue;
    const [, name, url, kind] = match;
    if (!name || !url || !kind) continue;
    if (!map.has(name)) map.set(name, { name, url, fetchUrl: '', pushUrl: '' });
    const remote = map.get(name);
    if (!remote) continue;
    if (kind === 'fetch') remote.fetchUrl = url;
    if (kind === 'push') remote.pushUrl = url;
  }
  return [...map.values()];
}

export async function getBranchInfo(repoPath: string): Promise<BranchInfo> {
  const branchResult = await runGit(repoPath, ['branch', '--show-current'], { allowFailure: true });
  let branch = branchResult.failed ? '' : branchResult.stdout.trim();
  let detached = false;
  const headResult = await runGit(repoPath, ['rev-parse', '--short', 'HEAD'], { allowFailure: true });
  const headShort = headResult.failed ? null : headResult.stdout.trim();
  if (!branch) {
    detached = !!headShort;
    branch = headShort ? `detached@${headShort}` : 'HEAD';
  }

  const upstreamResult = await runGit(
    repoPath,
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    { allowFailure: true }
  );
  const upstream = upstreamResult.failed ? null : (upstreamResult.stdout.trim() || null);

  let ahead = 0;
  let behind = 0;
  if (upstream) {
    const counts = await runGit(
      repoPath,
      ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
      { allowFailure: true }
    );
    if (!counts.failed) {
      const [a, b] = counts.stdout.trim().split(/\s+/);
      ahead = Number(a) || 0;
      behind = Number(b) || 0;
    }
  }

  return {
    branch,
    detached,
    headSha: headShort,
    upstream,
    ahead,
    behind,
    remotes: await getRemotes(repoPath),
    lastFetch: await lastFetchTime(repoPath)
  };
}

async function parseNumstat(repoPath: string, cached: boolean): Promise<Map<string, DiffStat>> {
  const args = ['diff', '--numstat', '--no-renames'];
  if (cached) args.push('--cached');
  const result = await runGit(repoPath, args, { allowFailure: true });
  const map = new Map<string, DiffStat>();
  if (result.failed || !result.stdout) return map;
  for (const line of result.stdout.split('\n')) {
    if (!line) continue;
    const first = line.indexOf('\t');
    const second = line.indexOf('\t', first + 1);
    if (first < 0 || second < 0) continue;
    const addRaw = line.slice(0, first);
    const delRaw = line.slice(first + 1, second);
    const filePath = line.slice(second + 1);
    const binary = addRaw === '-' || delRaw === '-';
    map.set(filePath, {
      add: binary ? 0 : Number(addRaw) || 0,
      del: binary ? 0 : Number(delRaw) || 0,
      binary
    });
  }
  return map;
}

async function countUntrackedStats(absolutePath: string): Promise<DiffStat> {
  try {
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) return { add: 0, del: 0, binary: false };
    const buffer = await fs.readFile(absolutePath);
    if (isProbablyBinaryBuffer(buffer)) return { add: 0, del: 0, binary: true };
    const text = buffer.toString('utf8');
    if (!text) return { add: 0, del: 0, binary: false };
    return { add: text.split('\n').length - (text.endsWith('\n') ? 1 : 0), del: 0, binary: false };
  } catch {
    return { add: 0, del: 0, binary: false };
  }
}

function normalizeStatusCode(indexStatus: string, worktreeStatus: string): GitStatusCode {
  if (
    indexStatus === 'U'
    || worktreeStatus === 'U'
    || (indexStatus === 'A' && worktreeStatus === 'A')
    || (indexStatus === 'D' && worktreeStatus === 'D')
  ) {
    return 'U';
  }
  if (indexStatus === '?' && worktreeStatus === '?') return 'A';
  const staged = indexStatus !== ' ' && indexStatus !== '?' && indexStatus !== '!';
  let code = staged ? indexStatus : worktreeStatus;
  if (code === ' ') code = 'M';
  if (code === 'T') code = 'M';
  if (code === 'C') code = 'R';
  if (!'MADR'.includes(code) && code !== 'U') code = 'M';
  return code as GitStatusCode;
}

export async function getStatusFiles(repoPath: string): Promise<GitStatusFile[]> {
  const result = await runGit(repoPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024
  });
  const [unstagedStats, stagedStats] = await Promise.all([
    parseNumstat(repoPath, false),
    parseNumstat(repoPath, true)
  ]);

  const raw = result.stdout.toString('utf8');
  const fields = raw.split('\0');
  const files: GitStatusFile[] = [];
  for (let i = 0; i < fields.length; i += 1) {
    const entry = fields[i];
    if (!entry) continue;
    const xy = entry.slice(0, 2);
    const filePath = entry.slice(3);
    let origPath: string | null = null;
    if (xy[0] === 'R' || xy[0] === 'C' || xy[1] === 'R' || xy[1] === 'C') {
      origPath = fields[i + 1] || null;
      i += 1;
    }
    if (!filePath) continue;
    const indexStatus = xy[0] || ' ';
    const worktreeStatus = xy[1] || ' ';
    const untracked = indexStatus === '?' && worktreeStatus === '?';
    const staged = !untracked && indexStatus !== ' ' && indexStatus !== '!' && indexStatus !== '?';
    const status = normalizeStatusCode(indexStatus, worktreeStatus);
    let stats: DiffStat | undefined = staged ? stagedStats.get(filePath) : unstagedStats.get(filePath);
    if (untracked) {
      stats = await countUntrackedStats(path.join(repoPath, filePath));
    }
    if (!stats) stats = { add: 0, del: 0, binary: false };

    files.push({
      path: filePath,
      origPath,
      status,
      staged,
      untracked,
      indexStatus,
      worktreeStatus,
      add: stats.add,
      del: stats.del,
      binary: stats.binary
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

export async function getTree(repoPath: string): Promise<GitTreeResult> {
  const [allResult, untrackedResult, indexResult] = await Promise.all([
    runGit(repoPath, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024
    }),
    runGit(repoPath, ['ls-files', '-z', '--others', '--exclude-standard'], {
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024
    }),
    runGit(repoPath, ['ls-files', '-s', '-z'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })
  ]);

  const allPaths = allResult.stdout.toString('utf8').split('\0').filter(Boolean);
  const untrackedPaths = new Set(untrackedResult.stdout.toString('utf8').split('\0').filter(Boolean));
  const uniquePaths = [...new Set(allPaths)].sort((a, b) => a.localeCompare(b));
  const symlinkPaths = new Set<string>();

  const indexEntries = indexResult.stdout.toString('utf8').split('\0').filter(Boolean);
  for (const entry of indexEntries) {
    const tab = entry.indexOf('\t');
    if (tab < 0) continue;
    const meta = entry.slice(0, tab).split(' ');
    const mode = meta[0];
    const filePath = entry.slice(tab + 1);
    if (mode === '120000') symlinkPaths.add(filePath);
  }

  for (const filePath of uniquePaths) {
    if (!untrackedPaths.has(filePath) || symlinkPaths.has(filePath)) continue;
    try {
      const stat = await fs.lstat(path.join(repoPath, filePath));
      if (stat.isSymbolicLink()) symlinkPaths.add(filePath);
    } catch {
      /* deleted files */
    }
  }

  const MAX_ENTRIES = 40_000;
  const limitedPaths = uniquePaths.slice(0, MAX_ENTRIES);
  const entries: GitTreeNode[] = [];
  for (const filePath of limitedPaths) {
    let target: string | null = null;
    if (symlinkPaths.has(filePath)) {
      try {
        target = await fs.readlink(path.join(repoPath, filePath));
      } catch {
        target = null;
      }
    }
    entries.push({
      path: filePath,
      kind: symlinkPaths.has(filePath) ? 'link' : 'file',
      target
    });
  }

  return {
    entries,
    total: uniquePaths.length,
    truncated: uniquePaths.length > MAX_ENTRIES
  };
}

function parseDecorations(raw: string): string[] {
  if (!raw) return [];
  const refs: string[] = [];
  for (let part of raw.split(',')) {
    part = part.trim();
    if (!part) continue;
    if (part.startsWith('HEAD -> ')) part = part.slice('HEAD -> '.length);
    else if (part.startsWith('tag: ')) part = part.slice('tag: '.length);
    if (!refs.includes(part)) refs.push(part);
  }
  return refs;
}

function parseStatLine(line: string): [number, number] | null {
  const insertions = line.match(/(\d+)\s+insertions?\(\+\)/);
  const deletions = line.match(/(\d+)\s+deletions?\(-\)/);
  const changed = line.match(/(\d+)\s+files?\s+changed/);
  if (!insertions && !deletions && !changed) return null;
  return [insertions ? Number(insertions[1]) : 0, deletions ? Number(deletions[1]) : 0];
}

export async function getHistory(repoPath: string, limit = 80): Promise<GitCommit[]> {
  const format = '%H%x1f%P%x1f%an%x1f%ae%x1f%ar%x1f%at%x1f%D%x1f%s';
  const result = await runGit(repoPath, [
    'log',
    '--topo-order',
    '--decorate=short',
    '--date=relative',
    `--max-count=${Math.max(1, Math.min(limit, 300))}`,
    `--pretty=format:${format}`,
    '--shortstat'
  ], { allowFailure: true, maxBuffer: 64 * 1024 * 1024, timeout: 30_000 });
  if (result.failed) return [];

  const commits: GitCommit[] = [];
  let current: GitCommit | null = null;
  for (const line of result.stdout.split('\n')) {
    if (line.includes('\x1f')) {
      const parts = line.split('\x1f');
      if (parts.length >= 8) {
        const [sha, parentsRaw, author, email, when, timestamp, refsRaw, ...subjectParts] = parts;
        if (!sha || !author || !email || !when || !timestamp) continue;
        const parents = parentsRaw ? parentsRaw.split(' ').filter(Boolean) : [];
        current = {
          sha,
          parents,
          author,
          email,
          when,
          timestamp: Number(timestamp) || 0,
          refs: parseDecorations(refsRaw || ''),
          message: subjectParts.join('\x1f'),
          stats: [0, 0],
          merge: parents.length > 1
        };
        commits.push(current);
      }
      continue;
    }
    if (current) {
      const parsed = parseStatLine(line);
      if (parsed) current.stats = parsed;
    }
  }
  return commits;
}

export async function getRepoSummary(inputPath: string): Promise<RepoSummary> {
  const root = await normalizeRepo(inputPath);
  const [branchInfo, files] = await Promise.all([getBranchInfo(root), getStatusFiles(root)]);
  return {
    path: root,
    name: path.basename(root),
    branch: branchInfo.branch,
    detached: branchInfo.detached,
    upstream: branchInfo.upstream,
    ahead: branchInfo.ahead,
    behind: branchInfo.behind,
    lastFetch: branchInfo.lastFetch,
    remotes: branchInfo.remotes,
    changedCount: files.length,
    stagedCount: files.filter((file) => file.staged).length,
    unstagedCount: files.filter((file) => !file.staged).length,
    files
  };
}

export async function getSnapshot(
  inputPath: string,
  { historyLimit = 80 }: { historyLimit?: number } = {}
): Promise<RepoSnapshot> {
  const root = await normalizeRepo(inputPath);
  const [branchInfo, files, tree, history] = await Promise.all([
    getBranchInfo(root),
    getStatusFiles(root),
    getTree(root),
    getHistory(root, historyLimit)
  ]);
  return {
    path: root,
    name: path.basename(root),
    branch: branchInfo.branch,
    detached: branchInfo.detached,
    headSha: branchInfo.headSha,
    upstream: branchInfo.upstream,
    ahead: branchInfo.ahead,
    behind: branchInfo.behind,
    lastFetch: branchInfo.lastFetch,
    remotes: branchInfo.remotes,
    files,
    tree: tree.entries,
    treeTotal: tree.total,
    treeTruncated: tree.truncated,
    history
  };
}

export async function stageFile(repoPath: string, relativePath: string): Promise<void> {
  validateRelativePath(repoPath, relativePath);
  await runGit(repoPath, ['add', '-A', '--', relativePath]);
}

export async function unstageFile(repoPath: string, relativePath: string): Promise<void> {
  validateRelativePath(repoPath, relativePath);
  const result = await runGit(repoPath, ['restore', '--staged', '--', relativePath], { allowFailure: true });
  if (result.failed) {
    await runGit(repoPath, ['rm', '--cached', '-r', '--', relativePath]);
  }
}

export async function stageAll(repoPath: string): Promise<void> {
  await runGit(repoPath, ['add', '-A', '--', '.']);
}

export async function unstageAll(repoPath: string): Promise<void> {
  const result = await runGit(repoPath, ['restore', '--staged', '--', '.'], { allowFailure: true });
  if (result.failed) {
    const reset = await runGit(repoPath, ['reset', '-q'], { allowFailure: true });
    if (reset.failed) {
      await runGit(repoPath, ['rm', '-r', '--cached', '--', '.']);
    }
  }
}

export async function commit(repoPath: string, message: string): Promise<CommitResult> {
  if (!message || !message.trim()) throw new Error('Commit message is empty');
  const result = await runGit(repoPath, ['commit', '-m', message], {
    timeout: 60_000,
    env: { GIT_EDITOR: 'true' }
  });
  const head = await runGit(repoPath, ['rev-parse', '--short', 'HEAD'], { allowFailure: true });
  return {
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
    sha: head.failed ? null : head.stdout.trim()
  };
}

export async function fetchRepo(
  repoPath: string,
  { all = false, prune = true }: { all?: boolean; prune?: boolean } = {}
): Promise<string> {
  const args = ['fetch'];
  if (all) args.push('--all');
  if (prune) args.push('--prune');
  const result = await runGit(repoPath, args, { timeout: 180_000 });
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

export async function pullRepo(repoPath: string, strategy: PullStrategy = 'merge'): Promise<string> {
  const args = ['pull', '--no-edit'];
  if (strategy === 'rebase') args.push('--rebase');
  else if (strategy === 'ff-only') args.push('--ff-only');
  else args.push('--no-rebase');
  const result = await runGit(repoPath, args, { timeout: 180_000 });
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

export async function pushRepo(repoPath: string): Promise<string> {
  const result = await runGit(repoPath, ['push'], { timeout: 180_000 });
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

export async function getFileDiff(repoPath: string, relativePath: string, staged: boolean): Promise<FileDiff> {
  validateRelativePath(repoPath, relativePath);
  const args = ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--unified=3'];
  if (staged) args.push('--cached');
  args.push('--', relativePath);
  const result = await runGit(repoPath, args, { allowFailure: true });
  let diff = result.stdout || '';
  if (!diff.trim()) {
    // A clean tracked file has no diff. Only fabricate a hunk for untracked files.
    const tracked = await runGit(repoPath, ['ls-files', '--error-unmatch', '--', relativePath], { allowFailure: true });
    if (!tracked.failed) {
      return { diff: '', binary: false, empty: true };
    }
    try {
      const absolute = path.join(repoPath, relativePath);
      const stat = await fs.stat(absolute);
      if (stat.isFile() && stat.size <= 2 * 1024 * 1024) {
        const buffer = await fs.readFile(absolute);
        if (isProbablyBinaryBuffer(buffer)) {
          return { diff: '', binary: true, empty: true };
        }
        const text = buffer.toString('utf8');
        const lines = text.length ? text.split('\n') : [];
        const count = text.endsWith('\n') ? Math.max(0, lines.length - 1) : lines.length;
        if (count > 0) {
          const added = lines.slice(0, count).map((line) => `+${line}`).join('\n');
          diff = `@@ -0,0 +1,${count} @@\n${added}`;
        }
      }
    } catch {
      /* no file */
    }
  }
  return {
    diff,
    binary: /^Binary files/m.test(diff),
    empty: !diff.trim()
  };
}

export async function getHeadFile(repoPath: string, relativePath: string): Promise<GitHeadFile> {
  validateRelativePath(repoPath, relativePath);
  const result = await runGit(repoPath, ['show', `HEAD:${relativePath}`], {
    encoding: 'buffer',
    maxBuffer: 80 * 1024 * 1024
  });
  return {
    bytes: result.stdout,
    text: result.stdout.toString('utf8')
  };
}

export async function readGlobalGitConfig(): Promise<GitGlobalConfig> {
  const result = await runGit(process.cwd(), ['config', '--global', '--null', '--list'], { allowFailure: true });
  const values: Record<string, string> = {};
  if (!result.failed && result.stdout) {
    for (const entry of result.stdout.split('\0')) {
      if (!entry) continue;
      const nl = entry.indexOf('\n');
      if (nl < 0) continue;
      const key = entry.slice(0, nl);
      const value = entry.slice(nl + 1);
      values[key] = value;
    }
  }
  const pullRebase = String(values['pull.rebase'] || '').toLowerCase();
  const pullFf = String(values['pull.ff'] || '').toLowerCase();
  let pullStrategy: PullStrategy = 'merge';
  if (pullFf === 'only') pullStrategy = 'ff-only';
  else if (pullRebase === 'true') pullStrategy = 'rebase';

  return {
    name: values['user.name'] || '',
    email: values['user.email'] || '',
    defaultBranch: values['init.defaultBranch'] || 'main',
    editor: values['core.editor'] || 'nvim',
    pullStrategy,
    sign: String(values['commit.gpgsign'] || '').toLowerCase() === 'true',
    gpgKey: values['user.signingkey'] || '',
    prune: String(values['fetch.prune'] || '').toLowerCase() === 'true',
    raw: values
  };
}

export async function writeGitConfig(settings: GitConfigWriteInput): Promise<GitGlobalConfig> {
  const set = async (key: string, value: string | null | undefined): Promise<void> => {
    if (value === null || value === undefined || value === '') {
      await runGit(process.cwd(), ['config', '--global', '--unset-all', key], { allowFailure: true });
      return;
    }
    await runGit(process.cwd(), ['config', '--global', '--replace-all', key, String(value)]);
  };

  await set('user.name', settings.name);
  await set('user.email', settings.email);
  await set('init.defaultBranch', settings.defaultBranch);
  await set('core.editor', settings.editor);
  await set('fetch.prune', settings.prune ? 'true' : 'false');
  await set('commit.gpgsign', settings.sign ? 'true' : 'false');
  await set('user.signingkey', settings.sign ? (settings.gpgKey || '') : '');

  if (settings.pullStrategy === 'rebase') {
    await set('pull.rebase', 'true');
    await set('pull.ff', null);
  } else if (settings.pullStrategy === 'ff-only') {
    await set('pull.rebase', null);
    await set('pull.ff', 'only');
  } else {
    await set('pull.rebase', null);
    await set('pull.ff', null);
  }
  return readGlobalGitConfig();
}

export async function isValidRepo(repoPath: string): Promise<boolean> {
  try {
    await normalizeRepo(repoPath);
    return true;
  } catch {
    return false;
  }
}
