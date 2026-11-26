# 安装 GitGlance

[English](./INSTALL.md) | **简体中文**

GitGlance 由同一份源码构建出两个安装包：

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| macOS | `GitGlance-[YYMMDD.SHORTSHA]-arm.dmg` | 仅支持 Apple Silicon（arm64） |
| Windows | `GitGlance-[YYMMDD.SHORTSHA]-x64.exe` | 64 位 Windows 10/11，按用户安装的 NSIS 安装程序 |

其中 `YYMMDD.SHORTSHA` 是构建标记：构建日期加短提交 SHA。同一标记会显示在应用侧边栏徽标和 **关于** 对话框中，因此截图或问题报告可以精确定位到具体构建。

请从 [Releases 页面](https://github.com/delong8/git-glance/releases) 下载最新安装包。构建**未做代码签名、也未公证**，因此 macOS 的 Gatekeeper 与 Windows 的 SmartScreen 都会在首次启动时拦截，下面的步骤说明如何放行。

## 环境要求

- **Git**：已安装并位于 `PATH`。GitGlance 调用你本机的 `git` CLI，不内置 Git。
  - macOS：安装 Xcode Command Line Tools（`xcode-select --install`）或 Homebrew（`brew install git`）。
  - Windows：安装 [Git for Windows](https://git-scm.com/download/win)（其安装程序默认会把 Git 加入 `PATH`）。
- **可选 — Pi CLI**（`pi`）：用于 AI 对话。在 **设置 → LLM 提供商** 中配置端点；若 `pi` 不在 `PATH` 中，请用 `PI_BIN` 指定其可执行文件。
- **可选 — LibreOffice**：用于 Word/Excel/PowerPoint 预览。
- **macOS**：Apple Silicon Mac（M1 或更新）。发布的 DMG 仅含 arm64 架构，不支持 Intel Mac。
- **Windows**：64 位 Windows 10 或 11。Windows 版本为交叉编译，尚未在真实硬件上验证运行时行为，详见 [限制](../README.md#限制)。

## macOS（Apple Silicon）

1. 从 [Releases 页面](https://github.com/delong8/git-glance/releases) 下载 `GitGlance-[YYMMDD.SHORTSHA]-arm.dmg`。
2. 双击 DMG 将其挂载。
3. 在窗口中把 **GitGlance** 拖到 **应用程序** 文件夹，然后推出磁盘映像（在访达边栏点击 ⏏）。
4. 打开 **应用程序**，双击 **GitGlance**。由于应用未签名，macOS 会拦截首次启动：
   - macOS 15（Sequoia）及更高版本：**“Apple 无法验证“GitGlance”是否包含可能危害 Mac 安全或危及隐私的恶意软件。”**
   - 较早的 macOS：**“无法打开“GitGlance”，因为 Apple 无法检查其是否包含恶意软件。”**

   请点击 **完成**，**不要**点击 **移到废纸篓**。
5. 在「安全」设置中放行：
   1. 打开 **系统设置**（ 菜单 → 系统设置…）。
   2. 进入 **隐私与安全性**。
   3. 向下滚动到 **安全性** 区域。被拦截的启动之后，这里会出现：*“已阻止使用“GitGlance”，因为不是来自已识别的开发者。”*
   4. 点击 **仍要打开**。
   5. 使用触控 ID 或登录密码验证，然后在最后的确认对话框中点击 **打开**。

   macOS 会记住这次例外，之后可正常启动。macOS 14 及更早版本也可以改为：在「应用程序」中右键点击 **GitGlance**，选择 **打开**，再在对话框中确认 **打开**。
6. 如果 macOS 提示 **“GitGlance 已损坏，无法打开”**（未签名且带隔离标记的下载很常见），请在终端中清除隔离标记后重新启动：

   ```bash
   xattr -dr com.apple.quarantine /Applications/GitGlance.app
   open -a GitGlance
   ```

   这只移除该应用自身的「已下载」标记，等价于设置里的 **仍要打开** 例外。
7. 首次访问受保护位置时按提示授权。GitGlance 第一次读取桌面、文稿、下载、iCloud 云盘或外置磁盘中的仓库时，macOS 会询问权限，请选择允许。若错过了提示，可在 **系统设置 → 隐私与安全性** 中为 GitGlance 打开 **文件与文件夹**，或授予 **完全磁盘访问权限** 以在受保护文件夹中免提示工作。Pi 子进程以 GitGlance 的名义运行，会继承这些授权。
8. 启动后点击 **打开仓库…**（或 <kbd>⌘O</kbd>）选择 Git 工作区。仓库会在下次启动时恢复——后续操作见[使用指南](./USAGE.zh.md)。

### 更新

应用没有自动更新。请下载新的 DMG，退出 GitGlance，把新版本拖到 **应用程序** 中覆盖旧版本，然后重新启动。`~/Library/Application Support/GitGlance/config.json` 中的应用偏好和仓库列表会保留。

## Windows（x64）

1. 从 [Releases 页面](https://github.com/delong8/git-glance/releases) 下载 `GitGlance-[YYMMDD.SHORTSHA]-x64.exe`。
2. 运行安装程序。它按用户安装（无需管理员权限），并带有安装向导：
   1. 接受许可协议。
   2. 选择安装目录（默认 `%LOCALAPPDATA%\Programs\GitGlance`），并决定是否创建桌面快捷方式。
   3. 点击 **安装**，然后点击 **完成**。
3. 安装程序未签名，因此首次运行安装程序或应用时，SmartScreen 可能提示 **“Windows 已保护你的电脑”**：
   1. 点击 **更多信息**。
   2. 点击 **仍要运行**。
4. 从开始菜单（或桌面快捷方式）启动 **GitGlance**。
5. 点击 **打开仓库…** 选择 Git 工作区。若 Git 操作失败，请在新的命令提示符中确认 `git --version` 可用——必要时安装 [Git for Windows](https://git-scm.com/download/win)，然后重启 GitGlance。
6. 卸载：打开 **设置 → 应用 → 已安装的应用**，找到 **GitGlance**，选择 **卸载**。`%APPDATA%\GitGlance` 中的应用偏好会保留，除非你手动删除该目录。

## 校验下载（可选）

将下载文件的 SHA-256 与发布说明中公布的值进行比对：

```bash
# macOS
shasum -a 256 ~/Downloads/GitGlance-*-arm.dmg
```

```powershell
# Windows PowerShell
Get-FileHash .\Downloads\GitGlance-*-x64.exe -Algorithm SHA256
```

## 故障排查

- **macOS 提示“Apple 无法验证…”** — 在 **系统设置 → 隐私与安全性 → 安全性** 中点击 **仍要打开**（第 5 步）。
- **macOS 提示“GitGlance 已损坏，无法打开”** — 运行 `xattr -dr com.apple.quarantine /Applications/GitGlance.app`（第 6 步）。
- **Windows 提示“Windows 已保护你的电脑”** — 点击 **更多信息 → 仍要运行**（第 3 步）。
- **安装后 Git 操作失败** — 安装 Git 或修复 `PATH`，然后重启应用；GitGlance 不内置 Git。
- **AI 对话显示“Pi 未配置”** — 安装 `pi` CLI 或设置 `PI_BIN`，然后在 **设置 → LLM 提供商** 中配置。除对话外的功能不依赖 Pi。
- **Office 文件无法预览** — 安装 LibreOffice，或将 `LIBREOFFICE_BIN` 指向 `soffice`。文本、图片和 PDF 预览无需它即可使用。
- **Windows 特有问题** — 本工作区尚未在真实硬件上运行过 Windows 版本，欢迎在 [GitHub](https://github.com/delong8/git-glance/issues) 上反馈。

## 不支持的安装方式

- **Intel Mac**：未发布 Intel 或通用构建，DMG 仅含 arm64。
- **Linux**：未打包。
- **免 Gatekeeper 提示的分发**：需要在 Apple Developer ID 证书下签名并公证——详见 [签名与公证](../README.md#签名与公证)。
