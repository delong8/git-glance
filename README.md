# GitGlance

**English** | [简体中文](./README.zh.md)

A local Git desktop client built around the UI in [index.html](./index.html). It runs in Electron, executes the installed Git CLI, talks to the Pi coding agent for AI chat, and previews images, PDFs, Word/Excel/PowerPoint documents, and text files without uploading them anywhere.

**Official links**

- Repository: [github.com/delong8/git-glance](https://github.com/delong8/git-glance)
- Release downloads: [github.com/delong8/git-glance/releases](https://github.com/delong8/git-glance/releases)

![GitGlance workspace with a repository open](./docs/screenshots/workspace.png)

## Documentation

The [usage guide](./docs/USAGE.md) is the end-user walkthrough: opening and switching repositories, reading the summary, browsing the working tree, previewing files, staging and committing, the Chat history graph and its commit actions, worktrees, remotes, branches, tags, stashes, LFS audits, submodules, repository statistics and HTML reports, syncing with remotes, AI chat, settings, the About dialog, and troubleshooting. It is also available in [Simplified Chinese](./docs/USAGE.zh.md).

Quick links:

- [Quick start](./docs/USAGE.md#quick-start)
- [Opening repositories](./docs/USAGE.md#opening-repositories)
- [Browsing files and changes](./docs/USAGE.md#browsing-files-and-changes)
- [Previewing files](./docs/USAGE.md#previewing-files)
- [Committing changes](./docs/USAGE.md#committing-changes)
- [Worktrees](./docs/USAGE.md#worktrees)
- [Remotes](./docs/USAGE.md#remotes)
- [Branches](./docs/USAGE.md#branches)
- [Tags](./docs/USAGE.md#tags)
- [Stash](./docs/USAGE.md#stash)
- [LFS](./docs/USAGE.md#lfs)
- [Submodules](./docs/USAGE.md#submodules)
- [Statistics](./docs/USAGE.md#statistics)
- [AI chat with Pi](./docs/USAGE.md#ai-chat-with-pi)
- [Chat commit actions](./docs/USAGE.md#commit-actions)
- [Settings](./docs/USAGE.md#settings)
- [About GitGlance](./docs/USAGE.md#about-gitglance)
- [Keyboard shortcuts](./docs/USAGE.md#keyboard-shortcuts)
- [Troubleshooting](./docs/USAGE.md#troubleshooting)

### Screenshots

| File tree and preview | Image preview |
| --- | --- |
| ![File tree with a syntax-highlighted preview](./docs/screenshots/files-preview.png) | ![Image preview with zoom and metadata](./docs/screenshots/image-preview.png) |

| Working tree diff | Settings |
| --- | --- |
| ![Working tree diff for a modified source file](./docs/screenshots/file-diff.png) | ![Settings: appearance, language, and LLM provider](./docs/screenshots/settings-appearance.png) |

| Prompts settings | About GitGlance |
| --- | --- |
| ![Settings: system prompt and custom user prompts](./docs/screenshots/settings-prompts.png) | ![About GitGlance](./docs/screenshots/about.png) |

## Features

- **Multi-repository sidebar** with filtering, per-project branch and change counts, and an onboarding screen when no repository is open yet. The panel toggle at the start of the tab bar collapses it.
- **Repository summary** with the current branch, upstream, ahead/behind counts, and Fetch / Pull / Stash / Branch / Push actions. Stash saves the working tree in one click; Branch opens a picker for switching or creating a branch from any local or remote branch. A compact group at the far right opens the repository folder in the system file manager or a terminal at that path.
- **Full working-tree file tree**, including folders, symlinks, staged/unstaged/deleted badges, per-file stage toggles, and a filter.
- **Preview and diff panes** in the File tree and Chat tabs. Select a file to preview it; switch to its staged or unstaged diff.
- **Rich previews**
  - Images: PNG, JPEG, GIF, WebP, AVIF, BMP, ICO, SVG.
  - PDF: rendered with PDF.js, with page navigation and zoom.
  - Word, Excel, PowerPoint, and OpenDocument files: converted to PDF with LibreOffice, then rendered with PDF.js.
  - Text and source files: encoding detection (UTF-8/UTF-16 and legacy encodings), syntax highlighting, line numbers, and truncation for very large files.
  - Deleted files: preview from the HEAD revision.
  - Binary files: a clear fallback instead of garbled content.
- **Worktrees tab** listing every linked worktree for the repository, with branch, HEAD, path, main/current/locked/prunable badges, filtering, and open/reveal/copy actions.
- **Remote tab** listing every configured remote with fetch and push URLs, the default branch, remote-tracking branches, filtering, per-remote fetch, and copy/open actions.
- **Branches tab** listing local and remote-tracking branches with current/remote/gone badges, upstream and ahead/behind state, latest commit details, filtering, and checkout/copy actions, plus a summary-header branch picker for switching or creating branches from any branch.
- **Tags tab** listing lightweight and annotated tags with type/HEAD badges, annotations, taggers, target commit details, filtering, and checkout/copy actions.
- **Stash tab** listing stashed work with branch, message, base commit, file stats, filtering, and apply/pop/drop/copy actions; the summary Stash button saves tracked and untracked changes.
- **LFS tab** with a two-column audit: LFS-tracked files on the left and non-LFS files over 5 MB on the right, with sizes, OIDs, pointer/tracking badges, filtering, and open/reveal/copy actions.
- **Submodules tab** listing each submodule with URL, expected/checked-out commits, branch, initialization/modified/dirty status, filtering, and update/open/reveal/copy actions.
- **Statistics tab** with commit, contributor, file, language, activity, repository, and working-tree metrics plus a **Download** action that writes a self-contained HTML report.
- **AI Chat tab** backed by the Pi agent, with a three-column workspace: an all-refs commit history graph on the left that loads the newest 80 commits first and pages older commits in as you scroll, a changed-file tree above the chat in the middle, and a preview pane on the right that opens when a changed file is selected. The preview has a hide button, so the tree and chat can use the full width. Right-clicking a commit offers New Branch, New Tag, Cherry Pick, Revert, Reset (Soft/Mixed/Hard), Squash into parent, and Copy SHA actions. Streaming responses, tool activity (including Git and shell commands), stop/new-chat controls, ↑/↓ recall of sent messages when the caret is at the end of the composer, and per-repository conversations are included.
- **Git settings** for identity, default branch, editor, pull strategy, GPG signing, pruning, and app-level auto-fetch behavior.
- **Prompts** configuration for the Pi agent: a system prompt appended to GitGlance's built-in assistant instructions, plus up to eight custom user prompts shown as one-click chips above the chat composer.
- **About dialog** from the info button beside the sidebar wordmark, with the release tag (the same `YYMMDD.shortSHA` stamp used in installer filenames), MIT license, runtime stack, Pi assistant note, and repository/release links.
- **Appearance** with light, dark, and system-following themes plus interface zoom (50%–500%), applied live and remembered between launches.
- **Language** with English and Simplified Chinese, applied live to the UI and native menus; repository content, code, and commit messages stay as-is.
- **Native desktop shell** with a custom protocol, sandboxed renderer, context-isolated IPC, native menus, and single-instance behavior.

## Requirements

- **Node.js 22+** and npm (tested with Node 26) to run from source or build the installer. The packaged app does not require Node.js.
- **macOS** to build the `.app`/DMG locally; the Windows x64 installer can be cross-built as described below.
- **Git** installed and configured with your credentials. GitGlance uses the `git` on `PATH`; it does not bundle Git.
- **Pi agent CLI** (`pi`) available on `PATH`, or set `PI_BIN` to its executable. Configure the model endpoint in **Settings → LLM provider**; GitGlance starts Pi with `--mode rpc` and enables the `read`, `grep`, `find`, `ls`, and `bash` tools.
- **LibreOffice** is optional. Install it only if you want Word/Excel/PowerPoint previews. GitGlance looks for `soffice` in common locations or uses `LIBREOFFICE_BIN`.

The application source is strict TypeScript: the renderer is compiled by Vite, and the Electron main/preload/services are compiled with `tsc` into `dist-electron/`. Build and test scripts remain `.mjs` tooling.

Tested on macOS. The Electron main process is cross-platform and a Windows x64 installer builds successfully, but Windows runtime behavior has not been validated in this workspace.

## Run it

```bash
npm install
npm start
```

`npm start` builds the TypeScript renderer and Electron process, then launches Electron. On first launch, use **Open Repository…** (or <kbd>⌘O</kbd>) to add a Git working tree. Repositories are remembered between launches.

For renderer hot reload:

```bash
npm run dev
```

This starts Vite on `127.0.0.1:5173` and launches Electron against it.

To open a repository directly from the command line:

```bash
npx electron . --repo /path/to/repository
```

Set `PI_BIN` or `LIBREOFFICE_BIN` before launching if either tool is not in a standard location:

```bash
PI_BIN=/opt/homebrew/bin/pi LIBREOFFICE_BIN=/Applications/LibreOffice.app/Contents/MacOS/soffice npm start
```

## Build a macOS installer

The macOS package is built with electron-builder into `release/`:

```bash
npm run pack:mac           # release/mac-arm64/GitGlance.app
npm run dist:mac           # Apple Silicon DMG, signs if a Developer ID is available
npm run dist:mac:unsigned  # force a local build without a Developer ID (ad-hoc signed)
```

The DMG is written to:

```text
release/GitGlance-[YYMMDD.COMMIT_SHORT_SHA]-arm.dmg
```

For example: `release/GitGlance-261124.a1b2c3d-arm.dmg`. The date is the local build date (`YYMMDD`) and the suffix is `git rev-parse --short=7 HEAD`. The app shows the same tag in its sidebar badge and About dialog, so a screenshot or issue report identifies the exact build.

Open it and drag **GitGlance** to Applications. Without a Developer ID certificate the build is ad-hoc signed by `scripts/after-pack.mjs`; locally built artifacts are not quarantined by macOS, so it opens normally on the build machine. A copy moved to another Mac is quarantined by the download, and Gatekeeper refuses to launch it until the quarantine flag is cleared:

```bash
xattr -dr com.apple.quarantine /Applications/GitGlance.app
```

Clearing the flag is only a workaround for local testing — for distribution, sign with a Developer ID and notarize (below).

By default the installer targets Apple Silicon (`arm64`). To build a universal DMG, run:

```bash
npm run build
npx electron-builder --mac --universal
```

### Signing and notarization

For distribution outside your own Mac, use an Apple Developer ID Application certificate. electron-builder discovers an installed certificate automatically, or accepts it through `CSC_LINK`/`CSC_NAME`. With the certificate installed, build and notarize with:

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="ABCDE12345"

npm run build
npx electron-builder --mac --arm64 --config.mac.notarize=true
```

`@electron/notarize` also accepts an App Store Connect API key via `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`. The hardened-runtime entitlements used for signing are in `build/entitlements.mac.plist`.

The packaged app does not bundle Git, Pi, or LibreOffice. It looks for Git on `PATH`, Pi in standard Homebrew/home locations, and LibreOffice in `/Applications` or Homebrew. `PI_BIN` and `LIBREOFFICE_BIN` work when launching from a terminal; for a Finder launch, custom tool paths should be symlinked into a standard location such as `/opt/homebrew/bin` or `/usr/local/bin`.

## Build a Windows installer

electron-builder can cross-build the Windows x64 NSIS installer from macOS:

```bash
npm run dist:win
npm run dist:all   # macOS arm64 DMG + Windows x64 installer
```

The deliverable is the single installer:

```text
release/GitGlance-[YYMMDD.COMMIT_SHORT_SHA]-x64.exe
```

For example: `release/GitGlance-261124.a1b2c3d-x64.exe`. `dist:win` and `dist:all` rename the freshly built installers with this convention, remove older installers for the built platform(s), and delete electron-builder intermediates (`win-unpacked`, blockmaps, update metadata), so `release/` contains only the current installers. It is unsigned, so Windows SmartScreen may warn on first launch; sign it with a Windows code-signing certificate before distributing it. The installer uses the GitGlance icon from `build/icon.ico` and offers an assisted, per-user install with an optional installation directory.

On Apple Silicon, electron-builder’s bundled `makensis` is Intel-only. Install Rosetta 2 (`softwareupdate --install-rosetta --agree-to-license`) or point `ELECTRON_BUILDER_NSIS_DIR` at a native arm64 NSIS bundle with `elevate.exe` and `mac/makensis`. Building on Windows or a Windows CI runner avoids the cross-build requirement entirely. The Windows package is built from the same renderer and Electron main process, but it has not been executed on Windows in this workspace.

## AI chat

The Chat tab keeps one Pi RPC process per repository. Each prompt includes:

- repository path and current branch;
- upstream and ahead/behind state;
- changed files with status and line counts;
- the eight most recent commits;
- staged and unstaged diffs (clipped to about 22 KB each);
- the file selected in the changed-file tree, if any.

The Chat left column shows the commit graph across local, remote-tracking, and
tagged refs. Right-click a commit to create a branch or tag, cherry-pick,
revert, reset, squash it into its parent, or copy its SHA.

Pi is launched with the `read`, `grep`, `find`, `ls`, and `bash` tools. It can run Git and other shell commands when you ask it to, including creating commits; the system prompt tells it to explain the impact and ask before destructive operations. Shell commands run with the same OS privileges as GitGlance, so review what the agent proposes and treat repository content as untrusted input. Chat state is kept in the renderer per repository, and **New chat** resets the underlying Pi session. **Stop** aborts the current response.

GitGlance configures the model itself. **Settings → LLM provider** stores a provider ID, API protocol (`openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, or `google-vertex`), base URL, API key, and model ID in the app config. Before starting Pi, GitGlance writes those values into its own `pi-agent` directory (`models.json` and `settings.json`) and launches Pi with `PI_CODING_AGENT_DIR` pointed at it. The generated settings also set `defaultProjectTrust` to `never`, so neither the user-level `~/.pi` nor a repository-local `.pi` directory is read. Prompts and file excerpts may be sent to the configured model endpoint; Git operations and previews stay local.

## Git behavior

GitGlance runs `git` directly in the repository working directory with `LC_ALL=C` and `GIT_TERMINAL_PROMPT=0`:

- stage and unstage individual files, stage/unstage all files;
- commit the staged changes;
- stash tracked and untracked changes;
- switch branches and create a local branch from any local or remote branch;
- create branches and lightweight tags at any commit, cherry-pick, revert, reset (soft/mixed/hard), and squash a commit into its parent from the Chat history menu;
- fetch (optionally all remotes and with pruning), pull with merge/rebase/ff-only, and push;
- read diffs, status with rename and symlink information, history, remotes, and upstream tracking state.

Authentication is delegated to your existing Git credential helper or SSH agent. Because terminal prompts are disabled, an operation that needs interactive credentials fails visibly instead of hanging.

Branch switching and creation are supported, including local tracking branches for remote-only refs. The Chat history menu exposes cherry-pick, revert, reset, and squash; cherry-pick, revert, and squash abort on conflict. There is no merge-conflict editor or general interactive-rebase UI.

## Settings and local data

The Settings modal writes these keys to your **global** Git config (`~/.gitconfig` by default):

| UI | Git key |
| --- | --- |
| Full name / Email | `user.name`, `user.email` |
| Default branch | `init.defaultBranch` |
| Editor | `core.editor` |
| Pull: Merge | clears `pull.rebase` and `pull.ff` |
| Pull: Rebase | `pull.rebase=true` |
| Pull: Fast-forward only | `pull.ff=only` |
| Sign commits with GPG | `commit.gpgsign`, `user.signingkey` |
| Prune stale remote branches | `fetch.prune` |
| Fetch every remote | app preference |
| Theme | app preference |
| Language | app preference |
| Zoom | app preference |
| LLM provider (provider, API, base URL, key, model) | app preference |

Auto-fetch interval, fetch-all behavior, theme, language, zoom, and the LLM provider are app preferences, not Git config. They are stored with the repository list in Electron's user data directory:

- macOS: `~/Library/Application Support/GitGlance/config.json`
- Windows: `%APPDATA%/GitGlance/config.json`
- Linux: `~/.config/GitGlance/config.json`

The LLM provider is written to a `pi-agent` directory next to that config (`config.json` holds the editable values; `models.json` and `settings.json` are generated for Pi and kept `0600`). Office conversion PDFs are cached in a `preview-cache` directory next to that config. The app keeps the 220 most recent conversions.

## Architecture

```text
electron/
  main.cts            Electron window, app:// protocol, native menu, IPC, Pi prompt context
  preload.cts         contextBridge API exposed as window.gitglance
  shared/
    models.ts         Git, preview, Pi, settings, and IPC payload types
    ipc.ts            Typed preload API surface and response envelopes
  lib/
    git.cts           Git CLI: status, tree, history, diffs, stage/commit, sync, global config
    preview.cts       Text/image/PDF/Office previews, encoding detection, LibreOffice cache
    pi.cts            Pi RPC subprocess, app-managed LLM provider config, streaming, abort/reset
    config.cts        Persistent repo list and app preferences
src/
  main.ts             Renderer state, tabs, tree, history, chat, settings, preview detail
  i18n.ts             English/Simplified Chinese interface dictionary and DOM translator
  preview.ts          PDF.js/image/text/binary preview mounting and teardown
  types.ts            Renderer state and tree/graph interfaces
  gitglance.d.ts      window.gitglance API declaration
  app.css             Electron chrome and application styles
public/
  theme-boot.js       Pre-paint theme and language selection
  pdfjs/              PDF.js worker, cmaps, standard fonts, and wasm assets
build/
  icon.svg            macOS icon source derived from the GitGlance mark
  icon.icns           compiled application and DMG icon
  entitlements.mac.plist
scripts/
  dev.mjs             Vite + Electron development launcher
  smoke.mjs           Isolated end-to-end smoke test against the built app
docs/
  USAGE.md            End-user usage guide with screenshots
  USAGE.zh.md         Simplified Chinese usage guide with screenshots
  screenshots/        Documentation screenshots
release/              generated .app and DMG artifacts (gitignored)
```

The renderer is a plain ES-module browser app: no Node integration, no remote module, sandboxed preload, and all privileged work behind validated IPC handlers. File paths are validated against the repository root before reads or Git operations. External links open in the system browser.

## Verification

```bash
npm run typecheck
npm run smoke
```

`npm run typecheck` runs the strict renderer and Electron TypeScript projects. The smoke test builds both, creates a temporary Git repository with a linked worktree, a remote, local/remote branches, lightweight/annotated tags, a stash, LFS-tracked plus large files, and a submodule, along with an Electron profile; it launches GitGlance and checks that the project list, README preview, all ten repository tabs, statistics cards, the worktree, remote, branch, tag, stash, LFS, and submodule filters, the summary Stash action, branch creation/switching through the branch picker, and the Chat history right-click actions. It does not touch your real configuration or repositories.

To inspect the packaged rather than source app:

```bash
npm run pack:mac
open release/mac-arm64/GitGlance.app
```

Useful development variables:

| Variable | Purpose |
| --- | --- |
| `PI_BIN` | Path to the Pi executable (model settings come from the app's LLM provider config) |
| `LIBREOFFICE_BIN` | Path to `soffice` |
| `GITGLANCE_USER_DATA` | Override Electron user data (isolated profiles) |
| `GITGLANCE_REPO` | Open a repository on launch |
| `GITGLANCE_DISABLE_SINGLE_INSTANCE` | Allow parallel test instances |

## Limitations

- No interactive credential prompting, merge tool, or conflict resolution UI.
- Office previews depend on LibreOffice and may not perfectly reproduce complex layouts.
- Text previews are capped at 4 MB; very large PDFs, images, and Office files are rejected with a clear message.
- The default local installer is unsigned and not notarized. Distributing it to other Macs requires a Developer ID certificate and notarization.
- The default DMG is arm64-only; Intel and universal builds need an explicit electron-builder architecture.
- AI chat requires a working Pi installation and an LLM provider configured in Settings. The rest of the app works without Pi.
- The AI agent can run shell commands with your user privileges. GitGlance does not sandbox those commands; review destructive or credentialed operations before proceeding.

The self-contained design mockup at [design/mockup.html](./design/mockup.html) mirrors the shipped UI's light/dark/system appearance and English/简体中文 language settings.
