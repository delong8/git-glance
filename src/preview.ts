import * as pdfjsLib from 'pdfjs-dist';
import type { RenderTask } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import hljs from 'highlight.js';
import type {
  BinaryPreview,
  ImagePreview,
  PdfPreview,
  PreviewData,
  TextPreview
} from '../electron/shared/models';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(pdfWorkerUrl, document.baseURI).href;

const PDF_MAX_PAGES = 220;

interface PreviewOptions {
  onOpen?: () => void;
  onReveal?: () => void;
  onInfo?: (info?: { label?: string }) => void;
}

type PreviewCleanup = () => void;

interface PdfBlock {
  el: HTMLElement;
  pageNumber: number;
  scale: number;
  rendered: boolean;
  renderTask: RenderTask | null;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value);
  if (value && typeof value === 'object') {
    const record = value as { type?: unknown; data?: unknown };
    if (record.type === 'Buffer' && Array.isArray(record.data)) return new Uint8Array(record.data);
    if (record.data) return toUint8Array(record.data);
  }
  return new Uint8Array();
}

function previewAssetUrl(dir: string): string {
  return new URL(`pdfjs/${dir}/`, document.baseURI).href;
}

function buildActionButtons(container: HTMLElement, options: PreviewOptions, { openLabel = 'Open' }: { openLabel?: string } = {}): void {
  if (!options.onOpen && !options.onReveal) return;
  const actions = document.createElement('div');
  actions.className = 'preview-actions';
  actions.style.marginTop = '0';
  if (options.onOpen) {
    const open = document.createElement('button');
    open.className = 'preview-tool-btn';
    open.type = 'button';
    open.textContent = openLabel;
    open.addEventListener('click', () => options.onOpen?.());
    actions.appendChild(open);
  }
  if (options.onReveal) {
    const reveal = document.createElement('button');
    reveal.className = 'preview-tool-btn';
    reveal.type = 'button';
    reveal.textContent = 'Show in folder';
    reveal.addEventListener('click', () => options.onReveal?.());
    actions.appendChild(reveal);
  }
  container.appendChild(actions);
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */
function mountText(container: HTMLElement, data: TextPreview, options: PreviewOptions): PreviewCleanup {
  const content = String(data.content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const lineCount = content.length ? content.split('\n').length : 0;

  let highlighted: string;
  const language = data.language || 'plaintext';
  try {
    if (content.length <= 1_500_000 && language !== 'plaintext' && hljs.getLanguage(language)) {
      highlighted = hljs.highlight(content, { language, ignoreIllegals: true }).value;
    } else {
      highlighted = escapeHtml(content);
    }
  } catch {
    highlighted = escapeHtml(content);
  }

  const view = document.createElement('div');
  view.className = 'text-view';

  if (data.truncated) {
    const notice = document.createElement('div');
    notice.className = 'preview-notice';
    notice.textContent = `Preview limited to the first ${formatBytes(data.previewBytes || 0)} of this ${formatBytes(data.size)} file.`;
    view.appendChild(notice);
  }

  const scroll = document.createElement('div');
  scroll.className = 'text-scroll';
  const inner = document.createElement('div');
  inner.className = 'text-inner';

  const gutter = document.createElement('pre');
  gutter.className = 'text-gutter';
  gutter.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');

  const code = document.createElement('pre');
  code.className = 'text-code';
  const codeEl = document.createElement('code');
  codeEl.className = 'hljs';
  codeEl.innerHTML = highlighted || '\n';
  code.appendChild(codeEl);

  inner.appendChild(gutter);
  inner.appendChild(code);
  scroll.appendChild(inner);
  view.appendChild(scroll);

  const footer = document.createElement('div');
  footer.className = 'text-footer';
  const left = document.createElement('span');
  left.textContent = `${language} · ${lineCount.toLocaleString()} lines · ${data.encoding || 'UTF-8'}`;
  footer.appendChild(left);
  const right = document.createElement('span');
  right.className = 'right';
  right.textContent = `${formatBytes(data.size)}${data.truncated ? ' · truncated' : ''}`;
  footer.appendChild(right);
  view.appendChild(footer);

  if (options.onOpen || options.onReveal) {
    const actions = document.createElement('div');
    actions.className = 'preview-actions';
    actions.style.margin = '0 14px 10px';
    actions.style.justifyContent = 'flex-start';
    if (options.onOpen) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'preview-tool-btn';
      open.textContent = 'Open in default app';
      open.addEventListener('click', () => options.onOpen?.());
      actions.appendChild(open);
    }
    if (options.onReveal) {
      const reveal = document.createElement('button');
      reveal.type = 'button';
      reveal.className = 'preview-tool-btn';
      reveal.textContent = 'Show in folder';
      reveal.addEventListener('click', () => options.onReveal?.());
      actions.appendChild(reveal);
    }
    view.appendChild(actions);
  }

  container.appendChild(view);
  options.onInfo?.({
    label: `${language} · ${lineCount.toLocaleString()} lines · ${data.encoding || 'UTF-8'}`
  });
  return () => {};
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */
async function mountImage(container: HTMLElement, data: ImagePreview, options: PreviewOptions): Promise<PreviewCleanup> {
  const bytes = toUint8Array(data.bytes);
  const blob = new Blob([bytes as BlobPart], { type: data.mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const view = document.createElement('div');
  view.className = 'image-view';

  const toolbar = document.createElement('div');
  toolbar.className = 'image-toolbar';
  const meta = document.createElement('span');
  meta.className = 'image-info';
  meta.textContent = `${formatBytes(data.size)}`;
  toolbar.appendChild(meta);
  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  toolbar.appendChild(spacer);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'preview-tool-btn';
  toggle.textContent = 'Actual size';
  toolbar.appendChild(toggle);
  if (options.onOpen) {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'preview-tool-btn';
    open.textContent = 'Open';
    open.addEventListener('click', () => options.onOpen?.());
    toolbar.appendChild(open);
  }
  view.appendChild(toolbar);

  const scroll = document.createElement('div');
  scroll.className = 'image-scroll';
  const image = document.createElement('img');
  image.alt = data.name || data.path;
  image.src = url;
  scroll.appendChild(image);
  view.appendChild(scroll);
  container.appendChild(view);

  let actual = false;
  toggle.addEventListener('click', () => {
    actual = !actual;
    scroll.classList.toggle('is-actual', actual);
    toggle.textContent = actual ? 'Fit to panel' : 'Actual size';
  });

  await new Promise<void>((resolve, reject) => {
    if (image.complete) {
      resolve();
      return;
    }
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error('The image could not be decoded.')), { once: true });
  });

  meta.textContent = `${image.naturalWidth} × ${image.naturalHeight} · ${formatBytes(data.size)}`;
  options.onInfo?.({ label: `${image.naturalWidth} × ${image.naturalHeight} · ${formatBytes(data.size)}` });

  return () => {
    URL.revokeObjectURL(url);
  };
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */
async function mountPdf(container: HTMLElement, data: PdfPreview, options: PreviewOptions): Promise<PreviewCleanup> {
  const bytes = toUint8Array(data.bytes);
  const view = document.createElement('div');
  view.className = 'pdf-view';

  const toolbar = document.createElement('div');
  toolbar.className = 'pdf-toolbar';
  const meta = document.createElement('span');
  meta.className = 'pdf-meta';
  meta.textContent = 'Loading PDF…';
  toolbar.appendChild(meta);
  if (data.convertedFrom) {
    const engine = document.createElement('span');
    engine.className = 'pdf-engine';
    engine.textContent = `${data.convertedFrom.toUpperCase()} · LibreOffice`;
    toolbar.appendChild(engine);
  }
  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  toolbar.appendChild(spacer);
  const zoomOut = document.createElement('button');
  zoomOut.type = 'button';
  zoomOut.className = 'preview-tool-btn';
  zoomOut.textContent = '−';
  const zoomLabel = document.createElement('span');
  zoomLabel.className = 'pdf-zoom-label';
  zoomLabel.textContent = '100%';
  const zoomIn = document.createElement('button');
  zoomIn.type = 'button';
  zoomIn.className = 'preview-tool-btn';
  zoomIn.textContent = '+';
  const fit = document.createElement('button');
  fit.type = 'button';
  fit.className = 'preview-tool-btn';
  fit.textContent = 'Fit width';
  toolbar.appendChild(zoomOut);
  toolbar.appendChild(zoomLabel);
  toolbar.appendChild(zoomIn);
  toolbar.appendChild(fit);
  if (options.onOpen) {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'preview-tool-btn';
    open.textContent = 'Open';
    open.addEventListener('click', () => options.onOpen?.());
    toolbar.appendChild(open);
  }
  view.appendChild(toolbar);

  const scroll = document.createElement('div');
  scroll.className = 'pdf-scroll';
  const loading = document.createElement('div');
  loading.className = 'preview-loading';
  loading.innerHTML = '<span class="spinner"></span><span>Rendering PDF…</span>';
  scroll.appendChild(loading);
  view.appendChild(scroll);
  container.appendChild(view);

  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    cMapUrl: previewAssetUrl('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: previewAssetUrl('standard_fonts'),
    wasmUrl: previewAssetUrl('wasm'),
    useSystemFonts: true
  });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const pagesShown = Math.min(pageCount, PDF_MAX_PAGES);
  const firstPage = await pdf.getPage(1);
  const baseViewport = firstPage.getViewport({ scale: 1 });
  meta.textContent = `${pageCount.toLocaleString()} page${pageCount === 1 ? '' : 's'}`;
  loading.remove();

  const pagesContainer = document.createElement('div');
  pagesContainer.className = 'pdf-pages';
  scroll.appendChild(pagesContainer);

  let zoom = 1;
  let destroyed = false;
  let observer: IntersectionObserver | null = null;
  let blocks: PdfBlock[] = [];
  const tasks = new Set<RenderTask>();

  function fitScale(): number {
    const width = Math.max(320, scroll.clientWidth - 32);
    return width / baseViewport.width;
  }

  function clearBlocks(): void {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    for (const task of tasks) {
      try { task.cancel(); } catch { /* ignore */ }
    }
    tasks.clear();
    blocks = [];
    pagesContainer.innerHTML = '';
  }

  function renderBlock(block: PdfBlock): void {
    if (destroyed || block.rendered || block.renderTask) return;
    const pageNumber = block.pageNumber;
    pdf.getPage(pageNumber).then((page) => {
      if (destroyed) return;
      const viewport = page.getViewport({ scale: block.scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      block.el.style.width = `${Math.floor(viewport.width)}px`;
      block.el.style.height = `${Math.floor(viewport.height)}px`;
      const task = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
      });
      block.renderTask = task;
      tasks.add(task);
      task.promise.then(() => {
        if (destroyed) return;
        block.rendered = true;
        block.el.querySelector('.pdf-page-placeholder')?.remove();
        block.el.appendChild(canvas);
        canvas.classList.add('is-ready');
        block.renderTask = null;
        tasks.delete(task);
      }).catch((error: unknown) => {
        if (destroyed || (error as Error | null)?.name === 'RenderingCancelledException') return;
        const placeholder = block.el.querySelector('.pdf-page-placeholder');
        if (placeholder) {
          placeholder.innerHTML = `<span style="font-size:9px;color:#8a8f99">Page ${pageNumber} failed</span>`;
        }
        tasks.delete(task);
        block.renderTask = null;
      });
    }).catch(() => {
      const placeholder = block.el.querySelector('.pdf-page-placeholder');
      if (placeholder) placeholder.textContent = `Page ${pageNumber} unavailable`;
    });
  }

  function buildBlocks(): void {
    clearBlocks();
    const scale = fitScale() * zoom;
    const width = Math.max(1, Math.floor(baseViewport.width * scale));
    const height = Math.max(1, Math.floor(baseViewport.height * scale));
    for (let pageNumber = 1; pageNumber <= pagesShown; pageNumber += 1) {
      const block = document.createElement('div');
      block.className = 'pdf-page-block';
      block.innerHTML = `<div class="pdf-page-meta">Page ${pageNumber}</div>`;
      const pageEl = document.createElement('div');
      pageEl.className = 'pdf-page';
      pageEl.style.width = `${width}px`;
      pageEl.style.height = `${height}px`;
      pageEl.style.background = '#fff';
      const placeholder = document.createElement('div');
      placeholder.className = 'pdf-page-placeholder';
      placeholder.innerHTML = '<span class="spinner"></span>';
      pageEl.appendChild(placeholder);
      block.appendChild(pageEl);
      pagesContainer.appendChild(block);
      blocks.push({ el: pageEl, pageNumber, scale, rendered: false, renderTask: null });
    }
    if (pageCount > pagesShown) {
      const more = document.createElement('div');
      more.className = 'pdf-more';
      more.textContent = `Showing the first ${pagesShown} of ${pageCount} pages. Open the PDF for the rest.`;
      pagesContainer.appendChild(more);
    }
    const nextObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const block = blocks.find((candidate) => candidate.el === entry.target);
        if (block) {
          nextObserver.unobserve(entry.target);
          renderBlock(block);
        }
      }
    }, { root: scroll, rootMargin: '800px 0px' });
    observer = nextObserver;
    blocks.forEach((block) => nextObserver.observe(block.el));
  }

  function updateZoomLabel(): void {
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    zoomOut.disabled = zoom <= 0.4;
    zoomIn.disabled = zoom >= 3;
  }

  zoomOut.addEventListener('click', () => {
    zoom = Math.max(0.4, Math.round((zoom - 0.2) * 10) / 10);
    updateZoomLabel();
    buildBlocks();
  });
  zoomIn.addEventListener('click', () => {
    zoom = Math.min(3, Math.round((zoom + 0.2) * 10) / 10);
    updateZoomLabel();
    buildBlocks();
  });
  fit.addEventListener('click', () => {
    zoom = 1;
    updateZoomLabel();
    buildBlocks();
  });

  updateZoomLabel();
  buildBlocks();
  options.onInfo?.({
    label: `${pageCount.toLocaleString()} page${pageCount === 1 ? '' : 's'}${data.convertedFrom ? ` · ${data.convertedFrom.toUpperCase()} preview` : ''}`
  });

  return () => {
    destroyed = true;
    clearBlocks();
    try { void loadingTask.destroy(); } catch { /* ignore */ }
  };
}

/* ------------------------------------------------------------------ */
/* Binary                                                              */
/* ------------------------------------------------------------------ */
function mountBinary(container: HTMLElement, data: BinaryPreview, options: PreviewOptions): PreviewCleanup {
  const view = document.createElement('div');
  view.className = 'binary-view';
  view.innerHTML = `<span class="b-icon"><svg class="ico" aria-hidden="true"><use href="#i-file"/></svg></span>
    <h3>No inline preview</h3>
    <p>This file type isn’t supported by the built-in preview. Open it in its default application instead.</p>
    <div class="meta">${escapeHtml(data.extension ? `.${data.extension}` : 'binary')} · ${formatBytes(data.size)}</div>`;
  buildActionButtons(view, options, { openLabel: 'Open file' });
  container.appendChild(view);
  options.onInfo?.({ label: `${data.extension ? data.extension.toUpperCase() : 'Binary'} · ${formatBytes(data.size)}` });
  return () => {};
}

/* ------------------------------------------------------------------ */
/* Entry                                                               */
/* ------------------------------------------------------------------ */
export async function mountPreview(container: HTMLElement, data: PreviewData, options: PreviewOptions = {}): Promise<PreviewCleanup> {
  container.innerHTML = '';
  switch (data.kind) {
    case 'text':
      return mountText(container, data, options);
    case 'image':
      return mountImage(container, data, options);
    case 'pdf':
      return mountPdf(container, data, options);
    case 'binary':
      return mountBinary(container, data, options);
    default:
      throw new Error('This file does not have a preview.');
  }
}
