# Installing GitGlance

**English** | [简体中文](./INSTALL.zh.md)

GitGlance ships as two installers built from the same source:

| Platform | File | Notes |
| --- | --- | --- |
| macOS | `GitGlance-[YYMMDD.SHORTSHA]-arm.dmg` | Apple Silicon (arm64) only |
| Windows | `GitGlance-[YYMMDD.SHORTSHA]-x64.exe` | 64-bit Windows 10/11, per-user NSIS installer |

The `YYMMDD.SHORTSHA` part is the build stamp: the build date plus the short
commit SHA. The same stamp appears in the app's sidebar badge and **About**
dialog, so a screenshot or bug report can be traced to the exact build.

Download the current installers from the
[Releases page](https://github.com/delong8/git-glance/releases). The builds are
**not code-signed or notarized**, so both macOS Gatekeeper and Windows
SmartScreen warn on first launch. The steps below show how to allow the app.

## Requirements

- **Git** installed and on `PATH` — GitGlance drives the `git` CLI you already
  have; it does not bundle Git.
  - macOS: Xcode Command Line Tools (`xcode-select --install`) or Homebrew
    (`brew install git`).
  - Windows: [Git for Windows](https://git-scm.com/download/win) (its installer
    adds Git to `PATH` by default).
- **Optional — Pi CLI** (`pi`) for AI chat. Configure the endpoint in
  **Settings → LLM provider**; set `PI_BIN` to its executable if it is not on
  `PATH`.
- **Optional — LibreOffice** for Word/Excel/PowerPoint previews.
- **macOS**: an Apple Silicon Mac (M1 or newer). The published DMG is arm64
  only; Intel Macs are not supported.
- **Windows**: 64-bit Windows 10 or 11. The Windows build is cross-compiled and
  its runtime behavior has not been validated on real hardware — see
  [Limitations](../README.en.md#limitations).

## macOS (Apple Silicon)

1. Download `GitGlance-[YYMMDD.SHORTSHA]-arm.dmg` from the
   [Releases page](https://github.com/delong8/git-glance/releases).
2. Double-click the DMG to mount it.
3. Drag **GitGlance** onto the **Applications** folder in the window, then
   eject the disk image (⏏ in the Finder sidebar).
4. Open **Applications** and double-click **GitGlance**. Because the app is
   unsigned, macOS blocks the first launch:
   - macOS 15 (Sequoia) and later: **“Apple could not verify ‘GitGlance’ is
     free of malware that may harm your Mac or compromise your privacy.”**
   - Older macOS: **“GitGlance can’t be opened because Apple cannot check it
     for malicious software.”**

   Click **Done** — do **not** click **Move to Trash**.
5. Allow the app through Security settings:
   1. Open **System Settings** ( menu → System Settings…).
   2. Go to **Privacy & Security**.
   3. Scroll down to the **Security** section. After the blocked launch it
      shows: *“GitGlance was blocked from use because it is not from an
      identified developer.”*
   4. Click **Open Anyway**.
   5. Authenticate with Touch ID or your login password, then confirm with
      **Open** in the final dialog.

   macOS remembers this exception, so later launches open normally. On macOS 14
   and earlier you can instead right-click **GitGlance** in Applications, choose
   **Open**, and confirm **Open** in the dialog.
6. If macOS reports **“GitGlance is damaged and can’t be opened”** — common for
   unsigned downloads that carry the quarantine flag — clear the flag from
   Terminal and launch the app again:

   ```bash
   xattr -dr com.apple.quarantine /Applications/GitGlance.app
   open -a GitGlance
   ```

   This only removes the downloaded-file flag from this app; it is the
   command-line equivalent of the **Open Anyway** exception.
7. Grant file access when prompted. The first time GitGlance reads a repository
   in a protected location (Desktop, Documents, Downloads, iCloud Drive,
   external volumes), macOS asks for permission — allow it. If you dismissed the
   prompt, enable **Files & Folders**, or **Full Disk Access** to work inside
   protected folders without prompts, in **System Settings → Privacy &
   Security**. The Pi child process runs under GitGlance, so it inherits these
   grants.
8. Launch GitGlance, choose **Open Repository…** (or <kbd>⌘O</kbd>), and pick a
   Git working tree. Repositories are remembered between launches — continue
   with the [usage guide](./USAGE.md).

### Updating

There is no auto-update. Download the newer DMG, quit GitGlance, drag the new
copy over the old one in **Applications**, and relaunch. App preferences and the
repository list in `~/Library/Application Support/GitGlance/config.json` are
kept.

## Windows (x64)

1. Download `GitGlance-[YYMMDD.SHORTSHA]-x64.exe` from the
   [Releases page](https://github.com/delong8/git-glance/releases).
2. Run the installer. It is an assisted, per-user install and does not require
   administrator rights:
   1. Accept the license agreement.
   2. Choose the installation folder (default
      `%LOCALAPPDATA%\Programs\GitGlance`) and whether to create a desktop
      shortcut.
   3. Click **Install**, then **Finish**.
3. The installer is unsigned, so SmartScreen may show **“Windows protected your
   PC”** on the first run of the installer or the app:
   1. Click **More info**.
   2. Click **Run anyway**.
4. Launch **GitGlance** from the Start menu (or the desktop shortcut).
5. Choose **Open Repository…** and pick a Git working tree. If Git operations
   fail, make sure `git --version` works in a new Command Prompt — install
   [Git for Windows](https://git-scm.com/download/win) if needed, then restart
   GitGlance.
6. To uninstall, open **Settings → Apps → Installed apps**, find **GitGlance**,
   and choose **Uninstall**. App preferences in `%APPDATA%\GitGlance` remain
   unless you delete that folder.

## Verify the download (optional)

Compare the SHA-256 of the downloaded file with the one published in the release
notes:

```bash
# macOS
shasum -a 256 ~/Downloads/GitGlance-*-arm.dmg
```

```powershell
# Windows PowerShell
Get-FileHash .\Downloads\GitGlance-*-x64.exe -Algorithm SHA256
```

## Troubleshooting

- **“Apple could not verify…” on macOS** — use the **Open Anyway** button under
  **System Settings → Privacy & Security → Security** (step 5).
- **“GitGlance is damaged and can’t be opened” on macOS** — run
  `xattr -dr com.apple.quarantine /Applications/GitGlance.app` (step 6).
- **“Windows protected your PC” on Windows** — **More info → Run anyway**
  (step 3).
- **Git operations fail after installation** — install Git or fix `PATH`, then
  restart the app; GitGlance does not bundle Git.
- **AI chat shows “Pi not configured”** — install the `pi` CLI or set `PI_BIN`,
  then configure **Settings → LLM provider**. Everything except chat works
  without Pi.
- **Office files do not preview** — install LibreOffice or point
  `LIBREOFFICE_BIN` at `soffice`. Text, image, and PDF previews work without it.
- **Windows-specific problems** — the Windows build has not been run on real
  hardware in this workspace; please report issues on
  [GitHub](https://github.com/delong8/git-glance/issues).

## Unsupported installs

- **Intel Macs**: no Intel or universal build is published; the DMG is arm64
  only.
- **Linux**: not packaged.
- **macOS quarantine-free distribution**: shipping without the Gatekeeper
  prompt requires an Apple Developer ID certificate and notarization — see
  [Signing and notarization](../README.en.md#signing-and-notarization).
