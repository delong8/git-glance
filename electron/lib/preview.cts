import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import chardet from 'chardet';
import iconv from 'iconv-lite';
import * as git from './git.cjs';
import type {
  OfficeType,
  PreviewCommon,
  PreviewData,
  TextPreview
} from '../shared/models.js';

const IMAGE_EXTENSIONS = new Map<string, string>([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['avif', 'image/avif'],
  ['bmp', 'image/bmp'],
  ['ico', 'image/x-icon'],
  ['svg', 'image/svg+xml']
]);

const OFFICE_TYPES = new Map<string, OfficeType>([
  ['doc', 'word'], ['docx', 'word'], ['dot', 'word'], ['dotx', 'word'], ['odt', 'word'], ['rtf', 'word'],
  ['xls', 'excel'], ['xlsx', 'excel'], ['xlsm', 'excel'], ['ods', 'excel'],
  ['ppt', 'powerpoint'], ['pptx', 'powerpoint'], ['odp', 'powerpoint'], ['pps', 'powerpoint'], ['ppsx', 'powerpoint']
]);

const TEXT_EXTENSIONS = new Set([
  'txt', 'text', 'md', 'markdown', 'mdx', 'rst', 'log', 'csv', 'tsv',
  'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'properties',
  'env', 'xml', 'html', 'htm', 'xhtml', 'css', 'scss', 'sass', 'less',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'vue', 'svelte', 'astro',
  'py', 'rb', 'php', 'java', 'kt', 'kts', 'scala', 'go', 'rs',
  'c', 'h', 'cc', 'cpp', 'hpp', 'hh', 'cs', 'swift', 'm', 'mm',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'lua', 'pl', 'pm', 'r', 'sql', 'graphql', 'gql', 'prisma', 'proto',
  'dockerfile', 'makefile', 'cmake', 'gradle', 'tex', 'bib', 'diff', 'patch',
  'gitignore', 'gitattributes', 'gitmodules', 'editorconfig', 'npmrc', 'nvmrc',
  'babelrc', 'eslintignore', 'prettierignore', 'htaccess', 'service', 'spec',
  'ipynb', 'lock', 'srt', 'vtt', 'mustache', 'hbs', 'njk', 'pug', 'sls'
]);

const TEXT_BASENAMES = new Set([
  'readme', 'license', 'licence', 'copying', 'notice', 'authors', 'contributors',
  'makefile', 'gnumakefile', 'dockerfile', 'containerfile', 'procfile', 'gemfile',
  'rakefile', 'brewfile', 'vagrantfile', 'jenkinsfile', 'cmakelists.txt',
  '.gitignore', '.gitattributes', '.gitmodules', '.editorconfig', '.npmrc', '.nvmrc',
  '.prettierrc', '.prettierignore', '.eslintignore', '.babelrc', '.env', '.htaccess',
  'changelog', 'changes', 'todo', 'version'
]);

const LANGUAGE_BY_EXTENSION = new Map<string, string>(Object.entries({
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  json: 'json', jsonc: 'json', json5: 'json', ipynb: 'json',
  yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', properties: 'properties',
  html: 'xml', htm: 'xml', xhtml: 'xml', xml: 'xml', svg: 'xml', vue: 'xml', svelte: 'xml',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  py: 'python', rb: 'ruby', php: 'php', java: 'java', kt: 'kotlin', kts: 'kotlin',
  scala: 'scala', go: 'go', rs: 'rust', c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp',
  cs: 'csharp', swift: 'swift', m: 'objectivec', mm: 'objectivec',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash', ps1: 'powershell', bat: 'dos', cmd: 'dos',
  lua: 'lua', pl: 'perl', pm: 'perl', r: 'r', sql: 'sql', graphql: 'graphql', gql: 'graphql',
  proto: 'protobuf', tex: 'latex', bib: 'latex', diff: 'diff', patch: 'diff',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown', rst: 'markdown',
  dockerfile: 'dockerfile', makefile: 'makefile', cmake: 'cmake', gradle: 'gradle',
  srt: 'plaintext', vtt: 'plaintext', env: 'bash'
}));

function makePreviewError(message: string): Error {
  return new Error(message);
}

function extensionOf(filePath: string): string {
  const base = path.basename(filePath).toLowerCase();
  if (base.endsWith('.env') || base.startsWith('.env.')) return 'env';
  const ext = path.extname(base);
  return ext ? ext.slice(1) : '';
}

function basenameKey(filePath: string): string {
  return path.basename(filePath).toLowerCase();
}

function isTextCandidate(filePath: string): boolean {
  const base = basenameKey(filePath);
  const ext = extensionOf(filePath);
  if (TEXT_BASENAMES.has(base)) return true;
  if (TEXT_EXTENSIONS.has(ext)) return true;
  return !ext;
}

function languageFor(filePath: string): string {
  const ext = extensionOf(filePath);
  return LANGUAGE_BY_EXTENSION.get(ext) || 'plaintext';
}

export function findSoffice(): string | null {
  const candidates = [
    process.env.LIBREOFFICE_BIN,
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/opt/homebrew/bin/soffice',
    '/usr/local/bin/soffice',
    '/usr/bin/soffice',
    '/usr/bin/libreoffice'
  ].filter((candidate): candidate is string => !!candidate);
  for (const candidate of candidates) {
    try {
      fsSync.accessSync(candidate, fsSync.constants.X_OK);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  const pathDirs = (process.env.PATH || '').split(path.delimiter);
  for (const dir of pathDirs) {
    for (const name of ['soffice', 'libreoffice']) {
      const candidate = path.join(dir, name);
      try {
        fsSync.accessSync(candidate, fsSync.constants.X_OK);
        return candidate;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

function decodeText(buffer: Buffer): { text: string; encoding: string } {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: buffer.subarray(3).toString('utf8'), encoding: 'UTF-8' };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: iconv.decode(buffer.subarray(2), 'utf16-le'), encoding: 'UTF-16LE' };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { text: iconv.decode(buffer.subarray(2), 'utf16-be'), encoding: 'UTF-16BE' };
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 64 * 1024));
  let detected: string | null = null;
  try {
    detected = chardet.detect(sample);
  } catch {
    detected = null;
  }

  // chardet often labels ordinary ASCII as ISO-8859-1. If the bytes are valid
  // UTF-8, prefer UTF-8 so ASCII documentation files still report correctly.
  const utf8Text = buffer.toString('utf8');
  const looksLikeUtf8 = !utf8Text.includes('\uFFFD') && Buffer.from(utf8Text, 'utf8').equals(buffer);
  if (!detected || detected === 'UTF-8' || detected === 'ASCII' || detected === 'ISO-8859-1' || detected === 'windows-1252') {
    if (looksLikeUtf8) return { text: utf8Text, encoding: 'UTF-8' };
  }
  const encoding = detected || 'UTF-8';
  if (encoding && iconv.encodingExists(encoding)) {
    return { text: iconv.decode(buffer, encoding), encoding };
  }
  return { text: utf8Text, encoding: 'UTF-8' };
}

interface SpawnCollectOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
}

function spawnCollect(command: string, args: string[], options: SpawnCollectOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeout || 120_000);
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(makePreviewError('Document conversion timed out.'));
        return;
      }
      if (code !== 0) {
        reject(makePreviewError((stderr || stdout || `Conversion exited with code ${code}${signal ? ` (${signal})` : ''}`).trim()));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

interface ConversionResult {
  bytes: Buffer;
  cached: boolean;
}

type FileStatLike = { size: number; mtimeMs: number; isDirectory?: () => boolean };

export class PreviewService {
  readonly cacheDir: string;
  readonly tempDir: string;
  readonly soffice: string | null;
  private conversions: Map<string, Promise<ConversionResult>>;

  constructor({ cacheDir, tempDir }: { cacheDir?: string; tempDir?: string } = {}) {
    this.cacheDir = cacheDir || path.join(os.tmpdir(), 'gitglance-preview');
    this.tempDir = tempDir || os.tmpdir();
    this.soffice = findSoffice();
    this.conversions = new Map();
  }

  async init(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.mkdir(this.tempDir, { recursive: true });
    this.pruneCache().catch(() => {});
  }

  async pruneCache(): Promise<void> {
    const entries = await fs.readdir(this.cacheDir, { withFileTypes: true }).catch(() => []);
    const files: { full: string; mtime: number }[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.pdf')) continue;
      const full = path.join(this.cacheDir, entry.name);
      const stat = await fs.stat(full).catch(() => null);
      if (stat) files.push({ full, mtime: stat.mtimeMs });
    }
    files.sort((a, b) => b.mtime - a.mtime);
    await Promise.all(files.slice(220).map((file) => fs.unlink(file.full).catch(() => {})));
  }

  async convertOffice(sourcePath: string, ext: string, headBytes: Buffer | null = null): Promise<ConversionResult> {
    const soffice = this.soffice;
    if (!soffice) {
      throw makePreviewError('LibreOffice was not found. Install LibreOffice to preview Word, Excel, and PowerPoint documents.');
    }
    const abs = path.resolve(sourcePath);
    const stat = headBytes ? null : await fs.stat(abs).catch(() => null);
    const cacheKey = crypto.createHash('sha256')
      .update(`${abs}|${stat ? `${stat.size}-${stat.mtimeMs}` : `head-${headBytes ? headBytes.length : 0}`}|${ext}`)
      .digest('hex');
    const cacheFile = path.join(this.cacheDir, `${cacheKey}.pdf`);
    const cached = await fs.readFile(cacheFile).catch(() => null);
    if (cached && cached.length > 0) {
      return { bytes: cached, cached: true };
    }
    if (this.conversions.has(cacheKey)) return this.conversions.get(cacheKey)!;

    const job = (async (): Promise<ConversionResult> => {
      const workDir = await fs.mkdtemp(path.join(this.tempDir, 'gitglance-convert-'));
      const outDir = path.join(workDir, 'out');
      const profileDir = path.join(workDir, 'profile');
      try {
        await fs.mkdir(outDir, { recursive: true });
        const sourceCopy = path.join(workDir, `source.${ext || 'bin'}`);
        if (headBytes) await fs.writeFile(sourceCopy, headBytes);
        else await fs.copyFile(abs, sourceCopy);

        const profileUrl = pathToFileURL(profileDir).href;
        const args = [
          '--headless',
          '--nologo',
          '--nofirststartwizard',
          '--norestore',
          '--nolockcheck',
          `-env:UserInstallation=${profileUrl}`,
          '--convert-to',
          'pdf',
          '--outdir',
          outDir,
          sourceCopy
        ];
        await spawnCollect(soffice, args, { cwd: workDir, timeout: 120_000 });
        const outputs = await fs.readdir(outDir).catch(() => []);
        const pdfName = outputs.find((name) => name.toLowerCase().endsWith('.pdf'));
        if (!pdfName) throw makePreviewError('LibreOffice did not produce a PDF preview.');
        const pdfPath = path.join(outDir, pdfName);
        const bytes = await fs.readFile(pdfPath);
        if (!bytes.length) throw makePreviewError('The converted preview is empty.');
        const tmpCache = `${cacheFile}.${process.pid}.tmp`;
        await fs.writeFile(tmpCache, bytes);
        await fs.rename(tmpCache, cacheFile).catch(async () => {
          await fs.copyFile(tmpCache, cacheFile).catch(() => {});
          await fs.unlink(tmpCache).catch(() => {});
        });
        return { bytes, cached: false };
      } finally {
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    })();

    this.conversions.set(cacheKey, job);
    try {
      return await job;
    } finally {
      this.conversions.delete(cacheKey);
    }
  }

  async previewFile(repoPath: string, relativePath: string): Promise<PreviewData> {
    const absolute = git.validateRelativePath(repoPath, relativePath);
    let lstat: fsSync.Stats | null = null;
    try {
      lstat = await fs.lstat(absolute);
    } catch {
      lstat = null;
    }
    if (lstat && lstat.isSymbolicLink()) {
      return {
        kind: 'link',
        path: relativePath,
        target: await fs.readlink(absolute).catch(() => null)
      };
    }
    let stat: FileStatLike | null = lstat;
    let head: git.GitHeadFile | null = null;

    if (!stat) {
      try {
        head = await git.getHeadFile(repoPath, relativePath);
        stat = { size: head.bytes.length, mtimeMs: Date.now() };
      } catch {
        throw makePreviewError('This file could not be read. It may have been deleted or moved.');
      }
    }
    if (stat.isDirectory?.()) {
      throw makePreviewError('Folders cannot be previewed as files.');
    }

    const ext = extensionOf(relativePath);
    const mimeType = IMAGE_EXTENSIONS.get(ext);
    const isOffice = OFFICE_TYPES.has(ext);
    const common: PreviewCommon = {
      path: relativePath,
      name: path.basename(relativePath),
      extension: ext,
      size: stat.size || head?.bytes.length || 0,
      mtimeMs: stat.mtimeMs || null,
      deleted: !!head
    };

    if (head) {
      // The working copy is gone; use the HEAD version for previews.
      if (mimeType) {
        return { ...common, kind: 'image', mimeType, bytes: head.bytes };
      }
      if (ext === 'pdf') {
        return { ...common, kind: 'pdf', mimeType: 'application/pdf', bytes: head.bytes };
      }
      if (isOffice) {
        const result = await this.convertOffice(absolute, ext, head.bytes);
        return {
          ...common,
          kind: 'pdf',
          mimeType: 'application/pdf',
          bytes: result.bytes,
          convertedFrom: ext,
          officeType: OFFICE_TYPES.get(ext),
          engine: 'LibreOffice',
          cached: result.cached
        };
      }
      if (isTextCandidate(relativePath) || (head.bytes.length && !git.isProbablyBinaryBuffer(head.bytes))) {
        return this.textPreview(common, head.bytes, relativePath, stat.size);
      }
      return { ...common, kind: 'binary' };
    }

    const MAX_TEXT = 4 * 1024 * 1024;
    const size = stat.size;

    if (mimeType) {
      if (size > 50 * 1024 * 1024) throw makePreviewError('This image is too large to preview (over 50 MB).');
      const bytes = await fs.readFile(absolute);
      return { ...common, kind: 'image', mimeType, bytes };
    }
    if (ext === 'pdf') {
      if (size > 150 * 1024 * 1024) throw makePreviewError('This PDF is too large to preview (over 150 MB).');
      const bytes = await fs.readFile(absolute);
      return { ...common, kind: 'pdf', mimeType: 'application/pdf', bytes };
    }
    if (isOffice) {
      if (size > 100 * 1024 * 1024) throw makePreviewError('This document is too large to preview (over 100 MB).');
      const result = await this.convertOffice(absolute, ext);
      return {
        ...common,
        kind: 'pdf',
        mimeType: 'application/pdf',
        bytes: result.bytes,
        convertedFrom: ext,
        officeType: OFFICE_TYPES.get(ext),
        engine: 'LibreOffice',
        cached: result.cached
      };
    }

    if (isTextCandidate(relativePath) || size <= 64 * 1024) {
      const readSize = Math.min(size, MAX_TEXT);
      let bytes: Buffer;
      if (readSize < size) {
        const handle = await fs.open(absolute, 'r');
        try {
          const buffer = Buffer.alloc(readSize);
          await handle.read(buffer, 0, readSize, 0);
          bytes = buffer;
        } finally {
          await handle.close();
        }
      } else {
        bytes = await fs.readFile(absolute);
      }
      if (!isTextCandidate(relativePath) && git.isProbablyBinaryBuffer(bytes)) {
        return { ...common, kind: 'binary' };
      }
      return this.textPreview(common, bytes, relativePath, size);
    }

    const sampleHandle = await fs.open(absolute, 'r');
    let sample: Buffer;
    try {
      const buffer = Buffer.alloc(Math.min(size, 8192));
      await sampleHandle.read(buffer, 0, buffer.length, 0);
      sample = buffer;
    } finally {
      await sampleHandle.close();
    }
    if (!git.isProbablyBinaryBuffer(sample)) {
      const readSize = Math.min(size, MAX_TEXT);
      const handle = await fs.open(absolute, 'r');
      let bytes: Buffer;
      try {
        bytes = Buffer.alloc(readSize);
        await handle.read(bytes, 0, readSize, 0);
      } finally {
        await handle.close();
      }
      return this.textPreview(common, bytes, relativePath, size);
    }
    return { ...common, kind: 'binary' };
  }

  textPreview(common: PreviewCommon, bytes: Buffer, relativePath: string, fullSize: number): TextPreview {
    const { text, encoding } = decodeText(bytes);
    const normalized = text.replace(/^\uFEFF/, '');
    const lines = normalized ? normalized.split('\n') : [];
    return {
      ...common,
      kind: 'text',
      encoding,
      language: languageFor(relativePath),
      content: normalized,
      lineCount: normalized.endsWith('\n') ? Math.max(0, lines.length - 1) : lines.length,
      truncated: fullSize > bytes.length,
      previewBytes: bytes.length
    };
  }
}
