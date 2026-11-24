import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import type {
  BranchInfo,
  CommitResult,
  DiffStat,
  FileDiff,
  GitBranchInfo,
  GitCheckoutResult,
  GitCommit,
  GitGlobalConfig,
  GitLargeFile,
  GitLfsFile,
  GitLfsReport,
  GitRemote,
  GitRemoteInfo,
  GitStatusCode,
  GitStatusFile,
  GitStashInfo,
  GitSubmoduleInfo,
  GitTagCheckoutResult,
  GitTagInfo,
  GitTreeNode,
  GitWorktree,
  PullStrategy,
  RepoActivityBucket,
  RepoContributorStat,
  RepoLanguageStat,
  RepoSnapshot,
  RepoStatistics,
  RepoSummary,
  ResetMode,
  StashAction,
  SubmoduleStatus
} from '../shared/models.js';

/**
 * GUI launches (Finder, Dock) inherit launchd's minimal PATH, which omits the
 * Homebrew and `/usr/local` prefixes that interactive shells add. Git needs
 * them to find helpers such as `git-lfs`, `git-credential-*` and difftools, so
 * mirror the usual shell ordering instead of failing with "command not found".
 */
function gitPath(): string {
  const current = (process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin').split(':').filter(Boolean);
  const missing = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/local/sbin'].filter(
    (dir) => !current.includes(dir)
  );
  return [...missing, ...current].join(':');
}

const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  PATH: gitPath(),
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
    const match = line.trim().match(/^(\S+)\s+(.+)\s+\((fetch|push)\)$/);
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

export async function getRemoteDetails(repoPath: string): Promise<GitRemoteInfo[]> {
  const remotes = await getRemotes(repoPath);
  if (!remotes.length) return [];
  const refs = await runGit(repoPath, ['for-each-ref', '--format=%(refname)%00%(symref)', 'refs/remotes'], { allowFailure: true });
  const lines = refs.failed ? [] : refs.stdout.split('\n').filter(Boolean);

  return remotes.map((remote) => {
    const prefix = `refs/remotes/${remote.name}/`;
    const branches: string[] = [];
    let defaultBranch: string | null = null;
    for (const line of lines) {
      const [refname, symrefRaw] = line.split('\0');
      if (!refname || !refname.startsWith(prefix)) continue;
      const short = refname.slice(prefix.length);
      if (short === 'HEAD') {
        const target = (symrefRaw || '').trim();
        if (target.startsWith(prefix)) defaultBranch = target.slice(prefix.length);
        continue;
      }
      if (!branches.includes(short)) branches.push(short);
    }
    branches.sort((a, b) => a.localeCompare(b));
    if (defaultBranch) {
      const index = branches.indexOf(defaultBranch);
      if (index > 0) branches.splice(index, 1);
      if (index !== 0) branches.unshift(defaultBranch);
    }
    return { ...remote, branches, defaultBranch };
  });
}

export async function fetchRemote(repoPath: string, remoteName: string, prune = true): Promise<string> {
  const remotes = await getRemotes(repoPath);
  if (!remotes.some((remote) => remote.name === remoteName)) {
    throw new Error(`Unknown remote: ${remoteName}`);
  }
  const args = ['fetch', remoteName];
  if (prune) args.push('--prune');
  const result = await runGit(repoPath, args, { timeout: 180_000 });
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

const BRANCH_REF_FORMAT = [
  '%(refname)',
  '%(objectname)',
  '%(upstream:short)',
  '%(upstream:track)',
  '%(committerdate:relative)',
  '%(committerdate:unix)',
  '%(authorname)',
  '%(subject)',
  '%(HEAD)',
  '%(symref)'
].join('%00');

export async function getBranches(repoPath: string): Promise<GitBranchInfo[]> {
  const result = await runGit(
    repoPath,
    ['for-each-ref', `--format=${BRANCH_REF_FORMAT}`, 'refs/heads', 'refs/remotes'],
    { allowFailure: true, maxBuffer: 64 * 1024 * 1024, timeout: 30_000 }
  );
  if (result.failed) return [];

  const branches: GitBranchInfo[] = [];
  for (const line of result.stdout.split('\n')) {
    if (!line) continue;
    const [refname, sha, upstreamRaw, track, when, timestamp, author, subject, headMark, symref] = line.split('\0');
    if (!refname || !sha || symref) continue;
    const local = refname.startsWith('refs/heads/');
    const remote = refname.startsWith('refs/remotes/');
    if (!local && !remote) continue;
    const name = local ? refname.slice('refs/heads/'.length) : refname.slice('refs/remotes/'.length);
    if (!name) continue;
    const ahead = Number(track.match(/ahead (\d+)/)?.[1] || 0);
    const behind = Number(track.match(/behind (\d+)/)?.[1] || 0);
    branches.push({
      name,
      remote,
      current: (headMark || '').trim() === '*',
      head: sha,
      upstream: upstreamRaw || null,
      ahead,
      behind,
      gone: track.includes('gone'),
      author: author || '',
      when: when || '',
      timestamp: Number(timestamp) || 0,
      subject: subject || ''
    });
  }

  branches.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    if (a.remote !== b.remote) return a.remote ? 1 : -1;
    if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
    return a.name.localeCompare(b.name);
  });
  return branches;
}

export async function checkoutBranch(repoPath: string, branchName: string): Promise<GitCheckoutResult> {
  const branches = await getBranches(repoPath);
  const branch = branches.find((entry) => entry.name === branchName);
  if (!branch) throw new Error(`Unknown branch: ${branchName}`);
  if (branch.current) return { branch: branch.name, output: '' };

  let target = branch.name;
  let args: string[];
  if (branch.remote) {
    const remotes = await getRemotes(repoPath);
    const remoteName = remotes
      .map((remote) => remote.name)
      .sort((a, b) => b.length - a.length)
      .find((name) => branch.name.startsWith(`${name}/`));
    const localName = remoteName ? branch.name.slice(remoteName.length + 1) : branch.name.split('/').slice(1).join('/');
    if (!localName) throw new Error(`Unknown branch: ${branchName}`);
    const localExists = branches.some((entry) => !entry.remote && entry.name === localName);
    target = localName;
    args = localExists ? ['switch', localName] : ['switch', '--track', branch.name];
  } else {
    args = ['switch', branch.name];
  }

  const result = await runGit(repoPath, args, { timeout: 60_000 });
  return {
    branch: target,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim()
  };
}

/** Create a local branch at `startPoint` and check it out. */
export async function createBranch(
  repoPath: string,
  branchName: string,
  startPoint: string
): Promise<GitCheckoutResult> {
  const name = branchName.trim();
  if (!name) throw new Error('Enter a branch name');
  const check = await runGit(repoPath, ['check-ref-format', '--branch', name], { allowFailure: true });
  if (check.failed) throw new Error(`Invalid branch name: ${name}`);

  const branches = await getBranches(repoPath);
  const base = branches.find((entry) => entry.name === startPoint);
  if (!base) throw new Error(`Unknown start point: ${startPoint}`);
  if (branches.some((entry) => !entry.remote && entry.name === name)) {
    throw new Error(`A local branch named ${name} already exists`);
  }

  const args = base.remote
    ? ['switch', '-c', name, '--track', base.name]
    : ['switch', '-c', name, base.name];
  const result = await runGit(repoPath, args, { timeout: 60_000 });
  return {
    branch: name,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim()
  };
}

/** Stash tracked and untracked working-tree changes. */
export async function stashChanges(repoPath: string): Promise<string> {
  const status = await runGit(repoPath, ['status', '--porcelain'], { allowFailure: true });
  if (!status.stdout.trim()) throw new Error('Working tree is clean — nothing to stash');
  const result = await runGit(repoPath, ['stash', 'push', '--include-untracked'], { timeout: 60_000 });
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}


const COMMIT_SHA_PATTERN = /^[0-9a-f]{4,64}$/i;

async function resolveCommit(repoPath: string, commitSha: string): Promise<string> {
  const sha = String(commitSha || '').trim();
  if (!COMMIT_SHA_PATTERN.test(sha)) throw new Error('Invalid commit SHA');
  const result = await runGit(repoPath, ['rev-parse', '--verify', `${sha}^{commit}`], { allowFailure: true });
  if (result.failed || !result.stdout.trim()) throw new Error(`Unknown commit: ${sha}`);
  return result.stdout.trim();
}

async function commitParents(repoPath: string, sha: string): Promise<string[]> {
  const result = await runGit(repoPath, ['rev-list', '--parents', '-n', '1', sha]);
  return result.stdout.trim().split(/\s+/).slice(1);
}

/** Create a local branch at an existing commit without checking it out. */
export async function createBranchAt(repoPath: string, branchName: string, commitSha: string): Promise<string> {
  const name = branchName.trim();
  if (!name) throw new Error('Enter a branch name');
  const check = await runGit(repoPath, ['check-ref-format', '--branch', name], { allowFailure: true });
  if (check.failed) throw new Error(`Invalid branch name: ${name}`);
  const sha = await resolveCommit(repoPath, commitSha);
  const branches = await getBranches(repoPath);
  if (branches.some((entry) => !entry.remote && entry.name === name)) {
    throw new Error(`A local branch named ${name} already exists`);
  }
  await runGit(repoPath, ['branch', name, sha], { timeout: 60_000 });
  return name;
}

/** Create a lightweight tag at an existing commit. */
export async function createTagAt(repoPath: string, tagName: string, commitSha: string): Promise<string> {
  const name = tagName.trim();
  if (!name) throw new Error('Enter a tag name');
  const check = await runGit(repoPath, ['check-ref-format', `refs/tags/${name}`], { allowFailure: true });
  if (check.failed) throw new Error(`Invalid tag name: ${name}`);
  const sha = await resolveCommit(repoPath, commitSha);
  const existing = await runGit(repoPath, ['show-ref', '--verify', '--quiet', `refs/tags/${name}`], { allowFailure: true });
  if (!existing.failed) throw new Error(`A tag named ${name} already exists`);
  await runGit(repoPath, ['tag', name, sha], { timeout: 60_000 });
  return name;
}

export async function cherryPickCommit(repoPath: string, commitSha: string): Promise<string> {
  const sha = await resolveCommit(repoPath, commitSha);
  const parents = await commitParents(repoPath, sha);
  const args = ['cherry-pick', '--no-edit'];
  if (parents.length > 1) args.push('-m', '1');
  args.push(sha);
  try {
    const result = await runGit(repoPath, args, { timeout: 180_000 });
    return `${result.stdout || ''}${result.stderr || ''}`.trim();
  } catch (error) {
    await runGit(repoPath, ['cherry-pick', '--abort'], { allowFailure: true });
    const message = error instanceof Error ? error.message : String(error);
    if (/previous cherry-pick is now empty|nothing to commit/i.test(message)) {
      throw new Error('That commit is already part of the current branch');
    }
    throw error;
  }
}

export async function revertCommit(repoPath: string, commitSha: string): Promise<string> {
  const sha = await resolveCommit(repoPath, commitSha);
  const parents = await commitParents(repoPath, sha);
  const args = ['revert', '--no-edit'];
  if (parents.length > 1) args.push('-m', '1');
  args.push(sha);
  try {
    const result = await runGit(repoPath, args, { timeout: 180_000 });
    return `${result.stdout || ''}${result.stderr || ''}`.trim();
  } catch (error) {
    await runGit(repoPath, ['revert', '--abort'], { allowFailure: true });
    throw error;
  }
}

const RESET_MODES: readonly ResetMode[] = ['soft', 'mixed', 'hard'];

export async function resetToCommit(repoPath: string, commitSha: string, mode: ResetMode): Promise<string> {
  if (!RESET_MODES.includes(mode)) throw new Error('Unknown reset mode');
  const sha = await resolveCommit(repoPath, commitSha);
  const result = await runGit(repoPath, ['reset', `--${mode}`, sha], { timeout: 120_000 });
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

function shellQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/** Squash a commit into its parent with an interactive rebase driven by a temp editor. */
export async function squashCommit(repoPath: string, commitSha: string): Promise<string> {
  const sha = await resolveCommit(repoPath, commitSha);
  const parents = await commitParents(repoPath, sha);
  if (!parents.length) throw new Error('The root commit has no parent to squash into');
  if (parents.length > 1) throw new Error('Merge commits cannot be squashed into a single parent');
  const ancestor = await runGit(repoPath, ['merge-base', '--is-ancestor', sha, 'HEAD'], { allowFailure: true });
  if (ancestor.failed) throw new Error('That commit is not on the current branch');

  const parent = parents[0];
  const grandparent = await runGit(repoPath, ['rev-parse', '--verify', `${parent}^`], { allowFailure: true });
  const base = grandparent.failed ? null : grandparent.stdout.trim();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitglance-squash-'));
  const sequenceEditor = path.join(tempDir, 'sequence-editor.cjs');
  const noopEditor = path.join(tempDir, 'noop-editor.cjs');
  await fs.writeFile(sequenceEditor, String.raw`const fs = require('node:fs');
const file = process.argv[2];
const target = process.env.GITGLANCE_SQUASH_SHA || '';
const lines = fs.readFileSync(file, 'utf8').split('\n');
let changed = false;
const output = lines.map((line) => {
  if (changed) return line;
  const match = line.match(/^pick\s+([0-9a-f]+)\s/);
  if (!match) return line;
  const picked = match[1];
  if (!(target.startsWith(picked) || picked.startsWith(target))) return line;
  changed = true;
  return line.replace(/^pick\s/, 'squash ');
});
if (!changed) process.exit(2);
fs.writeFileSync(file, output.join('\n'));
`);
  await fs.writeFile(noopEditor, 'process.exit(0);\n');

  const editor = `${shellQuote(process.execPath)} ${shellQuote(sequenceEditor)}`;
  const noop = `${shellQuote(process.execPath)} ${shellQuote(noopEditor)}`;
  const args = ['rebase', '-i', '--rebase-merges', ...(base ? [base] : ['--root'])];
  try {
    const result = await runGit(repoPath, args, {
      timeout: 300_000,
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        GIT_SEQUENCE_EDITOR: editor,
        GIT_EDITOR: noop,
        GITGLANCE_SQUASH_SHA: sha
      }
    });
    return `${result.stdout || ''}${result.stderr || ''}`.trim();
  } catch (error) {
    await runGit(repoPath, ['rebase', '--abort'], { allowFailure: true });
    throw error;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

const TAG_REF_FORMAT = [
  '%(refname:short)',
  '%(objecttype)',
  '%(objectname)',
  '%(*objecttype)',
  '%(*objectname)',
  '%(taggername)',
  '%(taggerdate:relative)',
  '%(taggerdate:unix)',
  '%(contents:subject)',
  '%(authorname)',
  '%(*authorname)',
  '%(subject)',
  '%(*subject)',
  '%(committerdate:relative)',
  '%(*committerdate:relative)',
  '%(committerdate:unix)',
  '%(*committerdate:unix)'
].join('%00');

export async function getTags(repoPath: string): Promise<GitTagInfo[]> {
  const [result, headResult] = await Promise.all([
    runGit(repoPath, ['for-each-ref', `--format=${TAG_REF_FORMAT}`, 'refs/tags'], {
      allowFailure: true,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30_000
    }),
    runGit(repoPath, ['rev-parse', 'HEAD'], { allowFailure: true })
  ]);
  if (result.failed) return [];
  const headSha = headResult.failed ? '' : headResult.stdout.trim();

  const tags: GitTagInfo[] = [];
  for (const line of result.stdout.split('\n')) {
    if (!line) continue;
    const [
      name,
      objectType,
      objectSha,
      peeledType,
      peeledSha,
      taggerName,
      taggerWhen,
      taggerUnix,
      contentsSubject,
      authorName,
      peeledAuthor,
      subject,
      peeledSubject,
      commitWhen,
      peeledCommitWhen,
      commitUnix,
      peeledCommitUnix
    ] = line.split('\0');
    if (!name || !objectSha) continue;
    const annotated = objectType === 'tag';
    const targetType = (annotated ? peeledType : objectType) || 'unknown';
    const head = (annotated ? peeledSha : objectSha) || objectSha;
    const commitTimestamp = Number((annotated ? peeledCommitUnix : commitUnix) || 0);
    const taggerTimestamp = Number(taggerUnix || 0);
    tags.push({
      name,
      head,
      targetType,
      annotated,
      atHead: targetType === 'commit' && !!headSha && head === headSha,
      subject: (annotated ? peeledSubject : subject) || '',
      author: (annotated ? peeledAuthor : authorName) || '',
      commitWhen: (annotated ? peeledCommitWhen : commitWhen) || '',
      annotation: annotated ? (contentsSubject || null) : null,
      tagger: annotated ? (taggerName || null) : null,
      when: (annotated ? taggerWhen || commitWhen : commitWhen) || '',
      timestamp: annotated && taggerTimestamp ? taggerTimestamp : commitTimestamp
    });
  }

  tags.sort((a, b) => {
    if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
    return a.name.localeCompare(b.name);
  });
  return tags;
}

export async function checkoutTag(repoPath: string, tagName: string): Promise<GitTagCheckoutResult> {
  const tags = await getTags(repoPath);
  const tag = tags.find((entry) => entry.name === tagName);
  if (!tag) throw new Error(`Unknown tag: ${tagName}`);
  if (tag.targetType !== 'commit') {
    throw new Error('Only tags that point to commits can be checked out');
  }
  const result = await runGit(repoPath, ['switch', '--detach', tag.head], { timeout: 60_000 });
  return {
    tag: tag.name,
    head: tag.head,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim()
  };
}

const STASH_FORMAT = ['%gd', '%H', '%gs', '%cr', '%ct', '%P', '%s'].join('%x00');

interface ParsedStash {
  index: number;
  ref: string;
  sha: string;
  branch: string | null;
  message: string;
  when: string;
  timestamp: number;
  base: string | null;
}

export async function getStashes(repoPath: string): Promise<GitStashInfo[]> {
  const result = await runGit(repoPath, ['stash', 'list', `--format=${STASH_FORMAT}`], {
    allowFailure: true,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30_000
  });
  if (result.failed) return [];

  const parsed: ParsedStash[] = [];
  for (const line of result.stdout.split('\n')) {
    if (!line) continue;
    const [ref, sha, subject, when, timestamp, parentsRaw, commitSubject] = line.split('\0');
    if (!ref || !sha) continue;
    const indexMatch = ref.match(/^stash@\{(\d+)\}$/);
    if (!indexMatch) continue;
    const parents = (parentsRaw || '').split(' ').filter(Boolean);
    const reflog = subject || commitSubject || '';
    const branchMatch = reflog.match(/^(?:WIP on|On) ([^:]+):/);
    parsed.push({
      index: Number(indexMatch[1]) || 0,
      ref,
      sha,
      branch: branchMatch ? branchMatch[1] : null,
      message: reflog,
      when: when || '',
      timestamp: Number(timestamp) || 0,
      base: parents[0] || null
    });
  }

  const stashes = await Promise.all(parsed.map(async (stash) => {
    const [baseResult, statResult] = await Promise.all([
      stash.base
        ? runGit(repoPath, ['log', '-1', '--format=%s', stash.base], { allowFailure: true })
        : Promise.resolve(null),
      runGit(repoPath, ['stash', 'show', '--numstat', stash.ref], {
        allowFailure: true,
        maxBuffer: 16 * 1024 * 1024
      })
    ]);
    let files = 0;
    let add = 0;
    let del = 0;
    let binary = false;
    if (statResult && !statResult.failed) {
      for (const line of statResult.stdout.split('\n')) {
        if (!line.trim()) continue;
        const [added, deleted] = line.split('\t');
        if (added == null || deleted == null) continue;
        files += 1;
        if (added === '-' || deleted === '-') binary = true;
        else {
          add += Number(added) || 0;
          del += Number(deleted) || 0;
        }
      }
    }
    return {
      ...stash,
      baseSubject: baseResult && !baseResult.failed ? baseResult.stdout.trim() : '',
      files,
      add,
      del,
      binary
    };
  }));

  stashes.sort((a, b) => a.index - b.index);
  return stashes;
}

export async function runStashAction(repoPath: string, ref: string, action: StashAction): Promise<string> {
  if (action !== 'apply' && action !== 'pop' && action !== 'drop') {
    throw new Error('Unknown stash action');
  }
  const stashes = await getStashes(repoPath);
  if (!stashes.some((stash) => stash.ref === ref)) throw new Error(`Unknown stash: ${ref}`);
  const result = await runGit(repoPath, ['stash', action, ref], { timeout: 120_000 });
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function readLfsPointer(absolutePath: string): Promise<{ oid: string; size: number } | null> {
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(absolutePath, 'r');
    const buffer = Buffer.alloc(512);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    const match = text.match(/^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\noid sha256:([0-9a-f]{64})\r?\nsize (\d+)/);
    if (!match) return null;
    return { oid: match[1], size: Number(match[2]) || 0 };
  } catch {
    return null;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

export async function getLfsReport(repoPath: string): Promise<GitLfsReport> {
  const [trackedResult, allResult, lfsResult] = await Promise.all([
    runGit(repoPath, ['ls-files', '-z'], { allowFailure: true, maxBuffer: 64 * 1024 * 1024, timeout: 30_000 }),
    runGit(repoPath, ['ls-files', '-co', '--exclude-standard', '-z'], { allowFailure: true, maxBuffer: 64 * 1024 * 1024, timeout: 30_000 }),
    runGit(repoPath, ['lfs', 'ls-files', '--long'], { allowFailure: true, maxBuffer: 16 * 1024 * 1024, timeout: 30_000 })
  ]);
  const tracked = trackedResult.failed ? [] : trackedResult.stdout.split('\0').filter(Boolean);
  const allFiles = allResult.failed ? tracked : allResult.stdout.split('\0').filter(Boolean);
  const trackedSet = new Set(tracked);
  const lfsAvailable = !lfsResult.failed;
  const lfsMeta = new Map<string, { oid: string; size: number }>();
  if (lfsAvailable) {
    for (const line of lfsResult.stdout.split('\n')) {
      const match = line.match(/^([0-9a-f]{64})\s+(\d+)\s+[*-]\s+(.+)$/);
      if (!match) continue;
      lfsMeta.set(match[3], { oid: match[1], size: Number(match[2]) || 0 });
    }
  }

  const lfsPaths = new Set<string>();
  const batchSize = 400;
  const batches: string[][] = [];
  for (let i = 0; i < tracked.length; i += batchSize) batches.push(tracked.slice(i, i + batchSize));
  const attrResults = await mapWithConcurrency(batches, 4, (batch) =>
    runGit(repoPath, ['check-attr', '-z', 'filter', '--', ...batch], {
      allowFailure: true,
      maxBuffer: 16 * 1024 * 1024
    })
  );
  for (const attr of attrResults) {
    if (attr.failed) continue;
    const tokens = attr.stdout.split('\0');
    for (let i = 0; i + 2 < tokens.length; i += 3) {
      if (tokens[i + 1] === 'filter' && tokens[i + 2] === 'lfs') lfsPaths.add(tokens[i]);
    }
  }
  for (const path of lfsMeta.keys()) lfsPaths.add(path);

  const lfs = await mapWithConcurrency([...lfsPaths].sort(), 32, async (relative): Promise<GitLfsFile> => {
    const absolute = path.join(repoPath, relative);
    let stat: Awaited<ReturnType<typeof fs.lstat>> | null = null;
    try {
      stat = await fs.lstat(absolute);
    } catch {
      stat = null;
    }
    const pointer = stat?.isFile() ? await readLfsPointer(absolute) : null;
    const meta = lfsMeta.get(relative);
    return {
      path: relative,
      size: pointer?.size ?? meta?.size ?? (stat?.isFile() ? stat.size : 0),
      oid: pointer?.oid ?? meta?.oid ?? null,
      pointer: !!pointer,
      missing: !stat
    };
  });

  const large = (await mapWithConcurrency(
    allFiles.filter((relative) => !lfsPaths.has(relative)),
    32,
    async (relative): Promise<GitLargeFile | null> => {
      const absolute = path.join(repoPath, relative);
      try {
        const stat = await fs.lstat(absolute);
        if (!stat.isFile() || stat.size <= LARGE_FILE_THRESHOLD) return null;
        return {
          path: relative,
          size: stat.size,
          tracked: trackedSet.has(relative),
          mtimeMs: stat.mtimeMs
        };
      } catch {
        return null;
      }
    }
  )).filter((entry): entry is GitLargeFile => entry != null);
  large.sort((a, b) => b.size - a.size || a.path.localeCompare(b.path));

  return { lfs, large, threshold: LARGE_FILE_THRESHOLD, lfsAvailable };
}

interface SubmoduleConfigEntry {
  path: string;
  url: string;
  branch: string | null;
}

export async function getSubmodules(repoPath: string): Promise<GitSubmoduleInfo[]> {
  const [statusResult, configResult] = await Promise.all([
    runGit(repoPath, ['submodule', 'status'], { allowFailure: true, maxBuffer: 64 * 1024 * 1024, timeout: 30_000 }),
    runGit(repoPath, ['config', '-f', '.gitmodules', '--get-regexp', '^submodule\\.'], {
      allowFailure: true,
      maxBuffer: 16 * 1024 * 1024
    })
  ]);
  if (statusResult.failed) return [];

  const byName = new Map<string, SubmoduleConfigEntry>();
  if (!configResult.failed) {
    for (const line of configResult.stdout.split('\n')) {
      const match = line.match(/^submodule\.(.+)\.(path|url|branch)\s+(.*)$/);
      if (!match) continue;
      const [, name, key, value] = match;
      const entry = byName.get(name) || { path: '', url: '', branch: null };
      if (key === 'path') entry.path = value.trim();
      else if (key === 'url') entry.url = value.trim();
      else entry.branch = value.trim() || null;
      byName.set(name, entry);
    }
  }
  const byPath = new Map<string, SubmoduleConfigEntry>();
  for (const entry of byName.values()) {
    if (entry.path) byPath.set(entry.path, entry);
  }

  const entries: { indexSha: string; path: string; describe: string | null; prefix: string }[] = [];
  for (const line of statusResult.stdout.split('\n')) {
    if (!line) continue;
    const prefix = line[0];
    const rest = line.slice(1);
    const indexSha = rest.slice(0, 40);
    if (!/^[0-9a-f]{40}$/.test(indexSha)) continue;
    let remainder = rest.slice(40).trimStart();
    let describe: string | null = null;
    const describeMatch = remainder.match(/^(.*?)\s+\(([^)]*)\)$/);
    if (describeMatch) {
      remainder = describeMatch[1];
      describe = describeMatch[2] || null;
    }
    const relative = remainder.trim();
    if (!relative) continue;
    entries.push({ indexSha, path: relative, describe, prefix });
  }

  const submodules = await mapWithConcurrency(entries, 8, async (entry): Promise<GitSubmoduleInfo> => {
    const config = byPath.get(entry.path);
    const status: SubmoduleStatus = entry.prefix === '-'
      ? 'uninitialized'
      : entry.prefix === '+'
        ? 'modified'
        : entry.prefix === 'U'
          ? 'conflicted'
          : 'current';
    const absolute = path.join(repoPath, entry.path);
    let isDirectory = false;
    try {
      isDirectory = (await fs.stat(absolute)).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory || status === 'uninitialized') {
      return {
        path: entry.path,
        url: config?.url || '',
        branch: config?.branch || null,
        indexSha: entry.indexSha,
        headSha: null,
        currentBranch: null,
        status: 'uninitialized',
        dirty: false,
        subject: '',
        author: '',
        when: '',
        describe: entry.describe
      };
    }

    const [headResult, branchResult, logResult, dirtyResult] = await Promise.all([
      runGit(absolute, ['rev-parse', 'HEAD'], { allowFailure: true }),
      runGit(absolute, ['branch', '--show-current'], { allowFailure: true }),
      runGit(absolute, ['log', '-1', '--format=%an%x00%ar%x00%s'], { allowFailure: true }),
      runGit(absolute, ['status', '--porcelain'], { allowFailure: true, maxBuffer: 32 * 1024 * 1024 })
    ]);
    const headSha = headResult.failed ? null : headResult.stdout.trim() || null;
    if (!headSha) {
      return {
        path: entry.path,
        url: config?.url || '',
        branch: config?.branch || null,
        indexSha: entry.indexSha,
        headSha: null,
        currentBranch: null,
        status: 'uninitialized',
        dirty: false,
        subject: '',
        author: '',
        when: '',
        describe: entry.describe
      };
    }
    const [author = '', when = '', ...subjectParts] = logResult.failed ? [] : logResult.stdout.trim().split('\0');
    return {
      path: entry.path,
      url: config?.url || '',
      branch: config?.branch || null,
      indexSha: entry.indexSha,
      headSha,
      currentBranch: branchResult.failed ? null : branchResult.stdout.trim() || null,
      status,
      dirty: !dirtyResult.failed && !!dirtyResult.stdout.trim(),
      subject: subjectParts.join('\0'),
      author,
      when,
      describe: entry.describe
    };
  });

  submodules.sort((a, b) => a.path.localeCompare(b.path));
  return submodules;
}

export async function updateSubmodule(repoPath: string, relativePath: string): Promise<string> {
  const submodules = await getSubmodules(repoPath);
  if (!submodules.some((submodule) => submodule.path === relativePath)) {
    throw new Error(`Unknown submodule: ${relativePath}`);
  }
  const result = await runGit(repoPath, ['submodule', 'update', '--init', '--', relativePath], {
    timeout: 300_000
  });
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

function weekStartTimestamp(timestamp: number): number {
  const date = new Date(timestamp);
  const day = date.getDay();
  const offset = (day + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - offset);
  return date.getTime();
}

export async function getStatistics(inputPath: string): Promise<RepoStatistics> {
  const root = await normalizeRepo(inputPath);
  const [
    branch,
    files,
    branches,
    tags,
    remotes,
    worktrees,
    submodules,
    stashes,
    countResult,
    shortlogResult,
    lastResult,
    firstResult,
    activityResult,
    lsFilesResult,
    objectResult
  ] = await Promise.all([
    getBranchInfo(root),
    getStatusFiles(root),
    getBranches(root),
    getTags(root),
    getRemoteDetails(root),
    getWorktrees(root),
    getSubmodules(root),
    getStashes(root),
    runGit(root, ['rev-list', '--count', 'HEAD'], { allowFailure: true }),
    runGit(root, ['shortlog', '-sne', 'HEAD'], { allowFailure: true, maxBuffer: 32 * 1024 * 1024 }),
    runGit(root, ['log', '-1', '--format=%H%x00%an%x00%ar%x00%s'], { allowFailure: true }),
    runGit(root, ['log', '--max-parents=0', '--format=%ar', '-1', 'HEAD'], { allowFailure: true }),
    runGit(root, ['log', '--format=%at', '--since=12 weeks ago', 'HEAD'], { allowFailure: true }),
    runGit(root, ['ls-files', '-z'], { allowFailure: true, maxBuffer: 64 * 1024 * 1024, timeout: 30_000 }),
    runGit(root, ['count-objects', '-v'], { allowFailure: true })
  ]);

  const allContributors: RepoContributorStat[] = [];
  if (!shortlogResult.failed) {
    for (const line of shortlogResult.stdout.split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(.+?)\s+<([^>]*)>$/);
      if (!match) continue;
      allContributors.push({ commits: Number(match[1]) || 0, name: match[2], email: match[3] });
    }
  }
  allContributors.sort((a, b) => b.commits - a.commits);

  const lastFields = lastResult.failed ? [] : lastResult.stdout.trim().split('\0');
  const lastWhen = lastFields[2] || null;
  const lastSubject = lastFields[3] || '';
  const lastAuthor = lastFields[1] || '';
  const firstWhen = firstResult.failed ? null : firstResult.stdout.trim() || null;

  const buckets: RepoActivityBucket[] = [];
  const weekStarts: number[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const currentWeekStart = weekStartTimestamp(now.getTime());
  for (let index = 11; index >= 0; index -= 1) {
    const start = currentWeekStart - index * 7 * 24 * 60 * 60 * 1000;
    weekStarts.push(start);
    const date = new Date(start);
    buckets.push({ label: `${date.getMonth() + 1}/${date.getDate()}`, count: 0 });
  }
  if (!activityResult.failed) {
    for (const raw of activityResult.stdout.split('\n')) {
      if (!raw.trim()) continue;
      const timestamp = Number(raw) * 1000;
      if (!Number.isFinite(timestamp)) continue;
      const start = weekStartTimestamp(timestamp);
      const index = Math.round((start - weekStarts[0]) / (7 * 24 * 60 * 60 * 1000));
      if (index >= 0 && index < buckets.length) buckets[index].count += 1;
    }
  }

  const trackedPaths = lsFilesResult.failed ? [] : lsFilesResult.stdout.split('\0').filter(Boolean);
  const fileStats = await mapWithConcurrency(trackedPaths, 32, async (relative): Promise<{ size: number; ext: string } | null> => {
    try {
      const stat = await fs.lstat(path.join(root, relative));
      if (!stat.isFile()) return null;
      const base = relative.split('/').pop() || relative;
      const dot = base.lastIndexOf('.');
      const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
      return { size: stat.size, ext };
    } catch {
      return null;
    }
  });
  let trackedFiles = 0;
  let trackedBytes = 0;
  const languageMap = new Map<string, RepoLanguageStat>();
  for (const entry of fileStats) {
    if (!entry) continue;
    trackedFiles += 1;
    trackedBytes += entry.size;
    const ext = entry.ext || 'text';
    const language = languageMap.get(ext) || { ext, files: 0, bytes: 0 };
    language.files += 1;
    language.bytes += entry.size;
    languageMap.set(ext, language);
  }
  const languages = [...languageMap.values()].sort((a, b) => b.bytes - a.bytes || b.files - a.files).slice(0, 8);

  let objectStoreBytes = 0;
  if (!objectResult.failed) {
    for (const line of objectResult.stdout.split('\n')) {
      const match = line.match(/^(size|size-pack):\s*(\d+)$/);
      if (match) objectStoreBytes += Number(match[2]) * 1024;
    }
  }

  const add = files.reduce((sum, file) => sum + file.add, 0);
  const del = files.reduce((sum, file) => sum + file.del, 0);

  return {
    generatedAt: new Date().toISOString(),
    repo: {
      name: path.basename(root),
      path: root,
      branch: branch.branch,
      detached: branch.detached,
      head: branch.headSha,
      upstream: branch.upstream,
      ahead: branch.ahead,
      behind: branch.behind,
      lastFetch: branch.lastFetch,
      remotes: remotes.length,
      worktrees: worktrees.length,
      submodules: submodules.length,
      stashes: stashes.length,
      localBranches: branches.filter((entry) => !entry.remote).length,
      remoteBranches: branches.filter((entry) => entry.remote).length,
      tags: tags.length
    },
    commits: {
      total: countResult.failed ? 0 : Number(countResult.stdout.trim()) || 0,
      contributors: allContributors.length,
      firstWhen,
      lastWhen,
      lastSubject,
      lastAuthor,
      activity: buckets
    },
    contributors: allContributors.slice(0, 12),
    workingTree: {
      changes: files.length,
      staged: files.filter((file) => file.staged).length,
      unstaged: files.filter((file) => !file.staged).length,
      add,
      del
    },
    files: {
      tracked: trackedFiles,
      bytes: trackedBytes,
      languages
    },
    objectStoreBytes
  };
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

export async function getHistory(repoPath: string, limit = 80, allRefs = false): Promise<GitCommit[]> {
  const format = '%H%x1f%P%x1f%an%x1f%ae%x1f%ar%x1f%at%x1f%D%x1f%s';
  const result = await runGit(repoPath, [
    'log',
    ...(allRefs ? ['--branches', '--remotes', '--tags'] : []),
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

interface ParsedWorktree {
  path: string;
  head: string | null;
  branch: string | null;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  lockReason: string | null;
  prunable: boolean;
  pruneReason: string | null;
}

async function realPathSafe(target: string): Promise<string> {
  try {
    return await fs.realpath(target);
  } catch {
    return path.resolve(target);
  }
}

export async function getWorktrees(inputPath: string): Promise<GitWorktree[]> {
  const root = await normalizeRepo(inputPath);
  const result = await runGit(root, ['worktree', 'list', '--porcelain'], { allowFailure: true });
  if (result.failed) return [];

  const entries: ParsedWorktree[] = [];
  let current: ParsedWorktree | null = null;
  const flush = (): void => {
    if (!current) return;
    entries.push(current);
    current = null;
  };

  for (const rawLine of result.stdout.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line) {
      flush();
      continue;
    }
    const space = line.indexOf(' ');
    const key = space === -1 ? line : line.slice(0, space);
    const value = space === -1 ? '' : line.slice(space + 1);
    if (key === 'worktree') {
      flush();
      current = {
        path: value,
        head: null,
        branch: null,
        detached: false,
        bare: false,
        locked: false,
        lockReason: null,
        prunable: false,
        pruneReason: null
      };
      continue;
    }
    if (!current) continue;
    if (key === 'HEAD') current.head = value || null;
    else if (key === 'branch') current.branch = value.replace(/^refs\/heads\//, '') || null;
    else if (key === 'detached') current.detached = true;
    else if (key === 'bare') current.bare = true;
    else if (key === 'locked') {
      current.locked = true;
      current.lockReason = value || null;
    } else if (key === 'prunable') {
      current.prunable = true;
      current.pruneReason = value || null;
    }
  }
  flush();

  const realRoot = await realPathSafe(root);
  return Promise.all(entries.map(async (entry, index) => ({
    ...entry,
    name: path.basename(entry.path) || entry.path,
    isMain: index === 0,
    isCurrent: await realPathSafe(entry.path) === realRoot
  })));
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
    getHistory(root, historyLimit, true)
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
