/* ============================================================
   Interface language (English / Simplified Chinese)
   ============================================================ */
import type { Language } from '../electron/shared/models';

export const LANGUAGE_STORAGE_KEY = 'gitglance.language';

type PatternRule = readonly [RegExp, (match: RegExpMatchArray) => string];
interface TextRecord { source: string; translated: string; }
interface AttrRecord { source: string; translated: string; }

let currentLanguage: Language = 'en';
let observer: MutationObserver | null = null;

const ZH: Record<string, string> = {
  "Projects": "项目",
  "Settings": "设置",
  "Git identity, defaults & signing": "Git 身份、默认值与签名",
  "Latest commit": "最新提交",
  "Fetch": "获取",
  "Pull": "拉取",
  "Push": "推送",
  "Working tree": "工作区",
  "files changed": "个文件已更改",
  "Upstream": "上游",
  "Chat": "对话",
  "File tree": "文件树",
  "History": "历史",
  "Beta": "测试版",
  "Private": "私有",
  "Local": "本地",
  "Ready": "就绪",
  "I can see": "我能看到",
  "Summarize my changes": "总结我的更改",
  "Review staged changes": "审阅已暂存的更改",
  "Review my current changes": "审阅当前更改",
  "Review anyway": "仍然审阅",
  "Summarize changes": "总结更改",
  "Review staged": "审阅已暂存",
  "Draft commit": "起草提交",
  "Draft a commit message": "起草提交信息",
  "send": "发送",
  "newline": "换行",
  "AI can make mistakes": "AI 可能会出错",
  "Changed content": "更改内容",
  "Worktree": "工作区",
  "Staged": "已暂存",
  "Changes": "更改",
  "Stage all": "全部暂存",
  "Unstage all": "全部取消暂存",
  "Preview": "预览",
  "current contents": "当前内容",
  "compared to index": "与索引比较",
  "compared to HEAD": "与 HEAD 比较",
  "Repository": "仓库",
  "Commit": "提交",
  "Hash": "哈希",
  "When": "时间",
  "merge": "合并",
  "Clean": "干净",
  "staged": "已暂存",
  "unstaged": "未暂存",
  "No commits yet": "暂无提交",
  "Working tree clean": "工作区干净",
  "No upstream configured": "未配置上游",
  "Add a remote to push and pull": "添加远程仓库以推送和拉取",
  "up to date": "已同步",
  "thinking…": "思考中…",
  "No files": "暂无文件",
  "No changes": "暂无更改",
  "Nothing staged": "暂无可提交内容",
  "Nothing to push — you're up to date": "没有可推送的内容 — 已是最新",
  "Stage at least one file before committing": "提交前请至少暂存一个文件",
  "Add a commit message first": "请先填写提交信息",
  "That file is no longer part of the working tree": "该文件已不在工作区中",
  "Repository picker is available in the GitGlance desktop app": "仓库选择器仅在 GitGlance 桌面应用中可用",
  "A Git author name is required": "需要 Git 作者姓名",
  "Enter a valid commit email": "请输入有效的提交邮箱",
  "Git settings saved to ~/.gitconfig": "Git 设置已保存到 ~/.gitconfig",
  "The state/verifier handoff is the risky part — make sure concurrent tabs can’t overwrite each other.": "state/verifier 的交接是风险点 — 确保并发标签页不会互相覆盖。",
  "New session store; confirm the TTL and refresh window line up with the API contract.": "新的会话存储；确认 TTL 和刷新窗口与 API 约定一致。",
  "Button structure changed; double-check focus order and provider labels.": "按钮结构已更改；请复核焦点顺序和提供商标签。",
  "Token-only change; verify contrast on raised surfaces.": "仅涉及 token 的更改；请验证浮层上的对比度。",
  "Query options changed; make sure the loading skeleton is still announced.": "查询选项已更改；确保加载骨架屏仍可被辅助技术识别。",
  "New file — check there’s test coverage before merging.": "新文件 — 合并前请确认有测试覆盖。",
  "Small change; the diff looks consistent with the surrounding code.": "较小的更改；diff 与周边代码风格一致。",
  "Your working tree is clean, but I can still help with history or commit messages.": "工作区是干净的，但我仍可以帮你查看历史或起草提交信息。",
  "Ask me to summarize the worktree, review a file, or draft a commit message.": "可以让我总结工作区、审阅文件或起草提交信息。",
  "Select a file": "选择文件",
  "Choose any file in the repository tree to preview its contents.": "在仓库树中选择任意文件以预览其内容。",
  "Preview not available": "无法预览",
  "Copy path": "复制路径",
  "Copy target path": "复制目标路径",
  "symlink": "符号链接",
  "Symlink": "符号链接",
  "tracked symbolic link": "已跟踪的符号链接",
  "target": "目标",
  "This is a symbolic link tracked by Git. Preview follows regular files only.": "这是 Git 跟踪的符号链接。预览仅适用于普通文件。",
  "Git config": "Git 配置",
  "Git ignore": "Git 忽略",
  "Go module": "Go 模块",
  "Go checksum": "Go 校验和",
  "Text": "文本",
  "commit message": "提交信息",
  "Copy": "复制",
  "Git defaults and app preferences for all of your workspaces": "适用于所有工作区的 Git 默认值与应用偏好",
  "Appearance": "外观",
  "Choose a theme, or let GitGlance follow your system appearance.": "选择主题，或让 GitGlance 跟随系统外观。",
  "Theme": "主题",
  "Zoom": "缩放",
  "Light": "浅色",
  "Dark": "深色",
  "Follow system": "跟随系统",
  "Applied immediately and saved to app preferences.": "立即生效并保存到应用偏好。",
  "Language": "语言",
  "Choose the interface language. Repository content and code stay unchanged.": "选择界面语言。仓库内容和代码保持不变。",
  "Interface language": "界面语言",
  "Applies immediately across the interface.": "立即应用到整个界面。",
  "LLM provider": "LLM 提供商",
  "The model endpoint used by the Pi chat agent. Stored in app preferences, not in": "Pi 对话智能体使用的模型端点。保存在应用偏好中，而非",
  "Provider ID": "提供商 ID",
  "Model ID": "模型 ID",
  "API": "API",
  "Base URL": "基础 URL",
  "API key": "API 密钥",
  "OpenAI Chat Completions": "OpenAI Chat Completions",
  "OpenAI Responses": "OpenAI Responses",
  "Anthropic Messages": "Anthropic Messages",
  "Google Generative AI": "Google Generative AI",
  "Google Vertex": "Google Vertex",
  "Written to GitGlance’s own Pi config. Leave blank for endpoints that don’t require a key, such as a local Ollama server.": "写入 GitGlance 自己的 Pi 配置。若端点不需要密钥（例如本地 Ollama 服务），请留空。",
  "Identity": "身份",
  "The name and email attached to every commit you create.": "附加到每个新提交的姓名和邮箱。",
  "Full name": "姓名",
  "Email": "邮箱",
  "Git defaults": "Git 默认值",
  "Applied to new repositories and pull operations in this workspace.": "应用于此工作区的新仓库和拉取操作。",
  "Default branch": "默认分支",
  "Editor": "编辑器",
  "When pulling": "拉取时",
  "Merge": "合并",
  "Rebase": "变基",
  "Fast-forward only": "仅快进",
  "Maps to": "映射到",
  "and": "和",
  "in your Git config.": "（位于 Git 配置中）。",
  "Auto-fetch remotes": "自动获取远程",
  "Off": "关闭",
  "Every 5 minutes": "每 5 分钟",
  "Every 15 minutes": "每 15 分钟",
  "Every 30 minutes": "每 30 分钟",
  "Every hour": "每小时",
  "Commit signing": "提交签名",
  "Verify authorship with a GPG key when creating commits.": "创建提交时使用 GPG 密钥验证作者身份。",
  "Sign commits with GPG": "使用 GPG 签名提交",
  "Adds a verified signature to every new commit.": "为每个新提交添加已验证的签名。",
  "GPG key ID": "GPG 密钥 ID",
  "Stored as": "存储为",
  "for this workspace.": "（用于此工作区）。",
  "Behavior": "行为",
  "Small defaults that keep repositories tidy while you work.": "保持仓库整洁的小默认设置。",
  "Prune stale remote branches": "清理过时的远程分支",
  "Remove remote-tracking refs that no longer exist on origin.": "移除 origin 上已不存在的远程跟踪引用。",
  "Fetch all remotes on open": "启动时获取所有远程",
  "Refresh every project as soon as GitGlance launches.": "GitGlance 启动后立即刷新所有项目。",
  "Auto-stage deleted files": "自动暂存已删除文件",
  "Stage removals automatically when files disappear from disk.": "文件从磁盘消失时自动暂存删除操作。",
  "Cancel": "取消",
  "Save changes": "保存更改",
  "No repositories": "暂无仓库",
  "Open a local Git worktree to get started.": "打开本地 Git 工作区以开始。",
  "Open repository": "打开仓库",
  "Modified": "已修改",
  "Added": "已添加",
  "Deleted": "已删除",
  "Renamed": "已重命名",
  "Changed": "已更改",
  "Conflicted": "冲突",
  "new file": "新文件",
  "deleted": "已删除",
  "modified": "已修改",
  "unified": "统一",
  "End of file": "文件结束",
  "Applied immediately across the app.": "立即应用到整个应用。",
  "Fetch every remote": "获取所有远程",
  "Update all configured remotes instead of only the upstream remote.": "更新所有已配置的远程，而不只是上游远程。",
  "Choose the interface language. Repository content and code stay the same.": "选择界面语言。仓库内容和代码保持不变。",
  "Remote": "远程",
  "no upstream": "无上游",
  "No remote configured": "未配置远程",
  "Refresh repository": "刷新仓库",
  "Fetch all remotes": "获取所有远程",
  "Pull from upstream": "从上游拉取",
  "Push to upstream": "推送到上游",
  "file changed": "个文件已更改",
  "Committing…": "正在提交…",
  "No repository": "无仓库",
  "No branch": "无分支",
  "no branch": "无分支",
  "Refresh": "刷新",
  "Try again": "重试",
  "Retry": "重试",
  "Developer": "开发者",
  "No projects found": "未找到项目",
  "No matching files": "没有匹配的文件",
  "Clear filter": "清除筛选",
  "No commits found": "未找到提交",
  "Clear search": "清除搜索",
  "This repository is empty": "此仓库为空",
  "Add files or make a first commit in your terminal, then refresh.": "在终端中添加文件或创建首次提交，然后刷新。",
  "Make the first commit in this repository and its history will appear here.": "在此仓库中创建首次提交，历史记录将显示在这里。",
  "Open your first repository": "打开你的第一个仓库",
  "GitGlance is a local desktop client. Point it at a folder inside a Git repository to inspect changes, stage files, browse history, and chat with Pi about your work.": "GitGlance 是一款本地桌面客户端。将它指向 Git 仓库中的文件夹，即可检查更改、暂存文件、浏览历史并与 Pi 对话。",
  "This repository could not be opened": "无法打开此仓库",
  "GitGlance could read the workspace list, but this worktree is no longer available or the Git command failed.": "GitGlance 可以读取工作区列表，但此工作区已不可用，或 Git 命令执行失败。",
  "Pick a worktree": "选择工作区",
  "Choose any folder inside a local Git repository.": "选择本地 Git 仓库中的任意文件夹。",
  "Review work": "审阅工作",
  "Stage, commit, compare, and preview every file.": "暂存、提交、比较并预览每个文件。",
  "Ask Pi": "询问 Pi",
  "Chat with the Pi agent using your real repository context.": "使用真实仓库上下文与 Pi 智能体对话。",
  "Pi agent:": "Pi 智能体：",
  "not available": "不可用",
  "Could not start GitGlance.": "无法启动 GitGlance。",
  "GitGlance for desktop": "GitGlance 桌面版",
  "Opening your repositories…": "正在打开你的仓库…",
  "This interface is an Electron desktop app.": "此界面是 Electron 桌面应用。",
  "Run": "运行",
  "(or": "（或",
  ") to launch it locally.": "）以在本地启动。",
  "Loading repository…": "正在加载仓库…",
  "Loading diff…": "正在加载差异…",
  "Loading file…": "正在加载文件…",
  "Loading image…": "正在加载图片…",
  "Loading preview…": "正在加载预览…",
  "Loading PDF…": "正在加载 PDF…",
  "Rendering PDF…": "正在渲染 PDF…",
  "Converting document…": "正在转换文档…",
  "LibreOffice is preparing a PDF preview.": "LibreOffice 正在准备 PDF 预览。",
  "Loading pages with PDF.js.": "正在使用 PDF.js 加载页面。",
  "Comparing this file with the index.": "正在将此文件与索引比较。",
  "Select a changed file": "选择已更改的文件",
  "Choose a changed file above to preview its content or diff.": "选择上方的已更改文件以预览其内容或差异。",
  "Preview unavailable": "预览不可用",
  "The file could not be previewed.": "无法预览此文件。",
  "Open in default app": "在默认应用中打开",
  "Show in folder": "在文件夹中显示",
  "Open file": "打开文件",
  "Open": "打开",
  "Actual size": "实际大小",
  "Fit to panel": "适应面板",
  "Fit width": "适应宽度",
  "Binary changes": "二进制更改",
  "Git can’t show a text diff for this file. Open it in its default application to inspect the change.": "Git 无法为此文件显示文本差异。请在默认应用中打开以查看更改。",
  "binary · no text diff": "二进制 · 无文本差异",
  "No text changes": "无文本更改",
  "There is no textual diff for this file in the selected area.": "所选区域中没有此文件的文本差异。",
  "no changes": "无更改",
  "unavailable": "不可用",
  "from HEAD": "来自 HEAD",
  "binary": "二进制",
  "unknown target": "未知目标",
  "This is a symbolic link tracked by Git. Use the target path below to reveal it.": "这是 Git 跟踪的符号链接。使用下方目标路径在文件夹中显示。",
  "Copy target": "复制目标",
  "No text diff available for this file": "此文件没有可用的文本差异",
  "No tracked changes in this file": "此文件没有已跟踪的更改",
  "File view": "文件视图",
  "Open full worktree": "打开完整工作区",
  "Pi offline": "Pi 离线",
  "Pi agent is unavailable. Install pi or set PI_BIN.": "Pi 智能体不可用。请安装 pi 或设置 PI_BIN。",
  "Pi agent is unavailable.": "Pi 智能体不可用。",
  "Stop response": "停止响应",
  "Send message": "发送消息",
  "Repository refreshed": "仓库已刷新",
  "Path copied to clipboard": "路径已复制到剪贴板",
  "Repository path copied to clipboard": "仓库路径已复制到剪贴板",
  "No repository is open": "未打开仓库",
  "Loading…": "正在加载…",
  "Preview · from HEAD": "预览 · 来自 HEAD",
  "truncated": "已截断",
  "Binary": "二进制",
  "Image": "图片",
  "PDF": "PDF",
  "Office": "Office",
  "converted": "已转换",
  "Unknown": "未知",
  "The image could not be decoded.": "无法解码此图片。",
  "No inline preview": "无内嵌预览",
  "This file type isn’t supported by the built-in preview. Open it in its default application instead.": "内置预览不支持此文件类型。请在默认应用中打开。",
  "Fetched": "已获取",
  "Pulled changes": "已拉取更改",
  "Pushed commits": "已推送提交",
  "Your working tree is clean, but I can still help with history, files, or commit messages.": "工作区是干净的，但我仍可以帮你查看历史、文件或提交信息。",
  "Chat with the Pi agent about your worktree, code, or a commit message.": "可以与 Pi 智能体讨论工作区、代码或提交信息。",
  "Using": "正在使用",
  "Stopped.": "已停止。",
  "No response.": "无响应。",
};

const ZH_ATTR: Record<string, string> = {
  "Git identity & settings": "Git 身份与设置",
  "Add repository": "添加仓库",
  "Filter projects": "筛选项目",
  "Clear project filter": "清除项目筛选",
  "Repository views": "仓库视图",
  "Filter files": "筛选文件",
  "Filter files…": "筛选文件…",
  "Search commits, authors…": "搜索提交、作者…",
  "Search commits and authors": "搜索提交和作者",
  "Clear search": "清除搜索",
  "New chat": "新建对话",
  "Start a new chat": "开始新对话",
  "Ask about your changes…": "询问你的更改…",
  "Message GitGlance AI": "给 GitGlance AI 发消息",
  "Send message": "发送消息",
  "Describe your changes…": "描述你的更改…",
  "Commit message": "提交信息",
  "Close settings": "关闭设置",
  "Theme": "主题",
  "Language": "语言",
  "Pull strategy": "拉取策略",
  "Sign commits with GPG": "使用 GPG 签名提交",
  "Prune stale remote branches": "清理过时的远程分支",
  "Fetch all remotes on open": "启动时获取所有远程",
  "Auto-stage deleted files": "自动暂存已删除文件",
  "Copy repository path": "复制仓库路径",
  "Copy file path": "复制文件路径",
  "File view": "文件视图",
  "Open full worktree": "打开完整工作区",
  "Copy commit SHA": "复制提交 SHA",
  "Stage file": "暂存文件",
  "Unstage file": "取消暂存文件",
  "Working tree clean": "工作区干净",
  "No tracked changes in this file": "此文件没有已跟踪的更改",
  "Modified": "已修改",
  "Added": "已添加",
  "Deleted": "已删除",
  "Renamed": "已重命名",
  "Changed": "已更改",
  "Conflicted": "冲突",
  "staged": "已暂存",
  "Refresh repository": "刷新仓库",
  "Fetch all remotes": "获取所有远程",
  "No remote configured": "未配置远程",
  "Pull from upstream": "从上游拉取",
  "No upstream configured": "未配置上游",
  "Push to upstream": "推送到上游",
  "Stop response": "停止响应",
  "No text diff available for this file": "此文件没有可用的文本差异",
};

const ZH_PATTERNS: readonly PatternRule[] = [
  [/^(\d+) projects? · auto-fetch every (\d+) min$/, (m) => `${m[1]} 个项目 · 每 ${m[2]} 分钟自动获取`],
  [/^(\d+) projects? · auto-fetch off$/, (m) => `${m[1]} 个项目 · 自动获取已关闭`],
  [/^(\d+) projects?$/, (m) => `${m[1]} 个项目`],
  [/^(\d+) files? changed$/, (m) => `${m[1]} 个文件已更改`],
  [/^(\d+) changed files?$/, (m) => `${m[1]} 个已更改文件`],
  [/^(\d+) files? · (\d+) links? · (\d+) changed$/, (m) => `${m[1]} 个文件 · ${m[2]} 个链接 · ${m[3]} 个已更改`],
  [/^(\d+) files? · (\d+) changed$/, (m) => `${m[1]} 个文件 · ${m[2]} 个已更改`],
  [/^(\d+) files? · (\d+) links?$/, (m) => `${m[1]} 个文件 · ${m[2]} 个链接`],
  [/^(\d+) files?$/, (m) => `${m[1]} 个文件`],
  [/^(\d+) staged · (\d+) unstaged$/, (m) => `${m[1]} 个已暂存 · ${m[2]} 个未暂存`],
  [/^(\d+) staged$/, (m) => `${m[1]} 个已暂存`],
  [/^(\d+) unstaged$/, (m) => `${m[1]} 个未暂存`],
  [/^(\d+) changed$/, (m) => `${m[1]} 个已更改`],
  [/^(\d+) ahead$/, (m) => `领先 ${m[1]}`],
  [/^(\d+) behind$/, (m) => `落后 ${m[1]}`],
  [/^(\d+) uncommitted files?$/, (m) => `${m[1]} 个未提交文件`],
  [/^(\d+) lines$/, (m) => `${m[1]} 行`],
  [/^(\d+) lines · (.*)$/, (m) => `${m[1]} 行 · ${m[2]}`],
  [/^End of file · (\d+) lines$/, (m) => `文件结束 · ${m[1]} 行`],
  [/^(.+) · (\d+) lines · (.+)$/, (m) => `${m[1]} · ${m[2]} 行 · ${m[3]}`],
  [/^(.+) · (\d+) lines$/, (m) => `${m[1]} · ${m[2]} 行`],
  [/^unified · (new file|deleted|modified)$/, (m) => `统一 · ${{ "new file": "新文件", deleted: "已删除", modified: "已修改" }[m[1]]}`],
  [/^(\d+)m ago$/, (m) => `${m[1]} 分钟前`],
  [/^(\d+)h ago$/, (m) => `${m[1]} 小时前`],
  [/^(\d+)d ago$/, (m) => `${m[1]} 天前`],
  [/^(\d+)mo ago$/, (m) => `${m[1]} 个月前`],
  [/^(\d+)y ago$/, (m) => `${m[1]} 年前`],
  [/^just now$/, () => "刚刚"],
  [/^yesterday$/, () => "昨天"],
  [/^never$/, () => "从未"],
  [/^fetched (.+)$/, (m) => `${zhRelative(m[1])}获取`],
  [/^(.+) · fetched (.+)$/, (m) => `${m[1]} · ${zhRelative(m[2])}获取`],
  [/^Ready · (.*) · (\d+) changes?$/, (m) => `就绪 · ${m[1]} · ${m[2]} 个更改`],
  [/^How can I help with (.*)\?$/, (m) => `我能帮你处理 ${m[1]} 吗？`],
  [/^— (\d+) staged and ready to review\. Ask me to summarize the worktree, review a file, or draft a commit message\.$/, (m) => `— 其中 ${m[1]} 个已暂存，可以审阅。可以让我总结工作区、审阅文件或起草提交信息。`],
  [/^(\d+) staged and ready to review$/, (m) => `${m[1]} 个已暂存，可以审阅`],
  [/^Commit (\d+) files?$/, (m) => `提交 ${m[1]} 个文件`],
  [/^Committed (.+) to (.+)$/, (m) => `已将 ${m[1]} 提交到 ${m[2]}`],
  [/^Fetched (.+) · (\d+) commits? behind$/, (m) => `已获取 ${m[1]} · 落后 ${m[2]} 个提交`],
  [/^Fetched (.+) · up to date$/, (m) => `已获取 ${m[1]} · 已同步`],
  [/^Already up to date with (.+)$/, (m) => `已与 ${m[1]} 同步`],
  [/^Fast-forwarded (\d+) commits? from (.+)$/, (m) => `已从 ${m[2]} 快进 ${m[1]} 个提交`],
  [/^Pushed (\d+) commits? to (.+)$/, (m) => `已推送 ${m[1]} 个提交到 ${m[2]}`],
  [/^(\d+) files? changed · (.+)$/, (m) => `${m[1]} 个文件已更改 · ${m[2]}`],
  [/^(.+) is unchanged and its contents aren’t loaded into this prototype\. Use Changes for tracked edits or copy the path below\.$/, (m) => `${m[1]} 未更改，其内容尚未加载到此原型中。使用“更改”查看已跟踪的编辑，或复制下方路径。`],
  [/^(\d+) changes?$/, (m) => `${m[1]} 个更改`],
  [/^Pi offline · (.*) · (\d+) changes?$/, (m) => `Pi 离线 · ${m[1]} · ${m[2]} 个更改`],
  [/^Pi not configured · (.*) · (\d+) changes?$/, (m) => `Pi 未配置 · ${m[1]} · ${m[2]} 个更改`],
  [/^Using (.*)…$/, (m) => `正在使用 ${m[1]}…`],
  [/^— (\d+) staged and ready to review\. Chat with the Pi agent about your worktree, code, or a commit message\.$/, (m) => `— 其中 ${m[1]} 个已暂存，可以审阅。可以与 Pi 智能体讨论工作区、代码或提交信息。`],
  [/^Your working tree is clean, but I can still help with history, files, or commit messages\. Chat with the Pi agent about your worktree, code, or a commit message\.$/, () => "工作区是干净的，但我仍可以帮你查看历史、文件或提交信息。可以与 Pi 智能体讨论工作区、代码或提交信息。"],
  [/^\. Chat with the Pi agent about your worktree, code, or a commit message\.$/, () => "。可以与 Pi 智能体讨论工作区、代码或提交信息。"],
  [/^There are no staged or unstaged files in (.*) right now\.$/, (m) => `当前 ${m[1]} 没有已暂存或未暂存的文件。`],
  [/^Opened (.*)$/, (m) => `已打开 ${m[1]}`],
  [/^(.*) removed from workspace$/, (m) => `已将 ${m[1]} 从工作区移除`],
  [/^Committed (.*) to (.*)$/, (m) => `已将 ${m[1]} 提交到 ${m[2]}`],
  [/^Copied (.*) to clipboard$/, (m) => `已复制 ${m[1]} 到剪贴板`],
  [/^Preview limited to the first (.+) of this (.+) file\.$/, (m) => `预览仅显示此 ${m[2]} 文件的前 ${m[1]}。`],
  [/^Page (\d+)$/, (m) => `第 ${m[1]} 页`],
  [/^Page (\d+) failed$/, (m) => `第 ${m[1]} 页加载失败`],
  [/^Page (\d+) unavailable$/, (m) => `第 ${m[1]} 页不可用`],
  [/^Showing the first (\d+) of (\d+) pages\. Open the PDF for the rest\.$/, (m) => `仅显示前 ${m[1]} 页，共 ${m[2]} 页。打开 PDF 查看其余内容。`],
  [/^(\d+) pages?$/, (m) => `${m[1]} 页`],
  [/^(\d+) page(?:s)? · (.+) preview$/, (m) => `${m[1]} 页 · ${m[2]} 预览`],
  [/^(.+) · from HEAD$/, (m) => `${m[1]} · 来自 HEAD`],
  [/^(\d+) seconds? ago$/, (m) => `${m[1]} 秒前`],
  [/^(\d+) minutes? ago$/, (m) => `${m[1]} 分钟前`],
  [/^(\d+) hours? ago$/, (m) => `${m[1]} 小时前`],
  [/^(\d+) days? ago$/, (m) => `${m[1]} 天前`],
  [/^(\d+) months? ago$/, (m) => `${m[1]} 个月前`],
  [/^(\d+) years? ago$/, (m) => `${m[1]} 年前`],
  [/^(.+) — click to preview$/, (m) => `${m[1]} — 点击预览`],
  [/^(\d+) weeks? ago$/, (m) => `${m[1]} 周前`],
  [/^([\d,]+) lines$/, (m) => `${m[1]} 行`],
  [/^([\d,]+) lines · (.*)$/, (m) => `${m[1]} 行 · ${m[2]}`],
  [/^(.+) · ([\d,]+) lines · (.+)$/, (m) => `${m[1]} · ${m[2]} 行 · ${m[3]}`],
  [/^End of file · ([\d,]+) lines$/, (m) => `文件结束 · ${m[1]} 行`],
  [/^([\d,]+) pages?$/, (m) => `${m[1]} 页`],
  [/^([\d,]+) page(?:s)? · (.+) preview$/, (m) => `${m[1]} 页 · ${m[2]} 预览`],
  [/^(.+) · truncated$/, (m) => `${m[1]} · 已截断`],
  [/^Nothing matches “(.*)”\.$/, (m) => `没有与“${m[1]}”匹配的内容。`],
  [/^Nothing in the repository matches “(.*)”\.$/, (m) => `仓库中没有与“${m[1]}”匹配的内容。`],
  [/^Nothing matches “(.*)” in this repository\.$/, (m) => `此仓库中没有与“${m[1]}”匹配的内容。`],
  [/^Fetched (.+)$/, (m) => `已获取 ${m[1]}`],
  [/^Pi agent is unavailable\. (.*)$/, (m) => `Pi 智能体不可用。${m[1]}`]

];

const ZH_ATTR_PATTERNS: readonly PatternRule[] = [
  [/^Ask about (.*)…$/, (m) => `询问关于 ${m[1]} 的更改…`],
  [/^(Stage|Unstage) (.+)$/, (m) => `${m[1] === "Stage" ? "暂存" : "取消暂存"} ${m[2]}`],
  [/^(Modified|Added|Deleted|Renamed|Changed|Conflicted) · staged$/, (m) => `${ZH_ATTR[m[1]]} · 已暂存`],
  [/^(\d+) uncommitted files?$/, (m) => `${m[1]} 个未提交文件`],
  [/^(\d+) changed files? · (\d+) staged$/, (m) => `${m[1]} 个已更改文件 · ${m[2]} 个已暂存`],
  [/^(\d+) changed files?$/, (m) => `${m[1]} 个已更改文件`],
  [/^(\d+) files? · (\d+) links? · (\d+) changed$/, (m) => `${m[1]} 个文件 · ${m[2]} 个链接 · ${m[3]} 个已更改`],
  [/^(\d+) files? · (\d+) changed$/, (m) => `${m[1]} 个文件 · ${m[2]} 个已更改`],
  [/^(\d+) files?$/, (m) => `${m[1]} 个文件`],
  [/^(.*) — click to preview$/, (m) => `${m[1]} — 点击预览`],
  [/^(.*) — click to preview · (Modified|Added|Deleted|Renamed|Changed|Conflicted)( \(staged\))?$/, (m) => `${m[1]} — 点击预览 · ${ZH_ATTR[m[2]]}${m[3] ? "（已暂存）" : ""}`]
];

const I18N_SKIP_SELECTOR = [
  '.code-line',
  '.diff-line',
  '.diff-hunk',
  '.text-code',
  '.text-gutter',
  '.chat-bubble',
  '.chat-file-ref',
  '.commit-msg',
  '.commit-author',
  '.commit-hash',
  '.proj-name',
  '.proj-path',
  '.tree-label',
  '.ext',
  '.ref-pill',
  '.link-target',
  '.link-card h3',
  '.wc-name',
  '.path-line',
  '.branch-pill',
  '.lang',
  '.sc-msg',
  '.proj-ab',
  '.diff-file',
  '.hash',
  '.status-badge',
  '.diff-add',
  '.diff-del',
  '.avatar',
  '.proj-avatar',
  '.chat-file-path',
  '.status-dot',
  '.theme-swatch',
  '.g-dot',
  '.image-info',
  'code',
  'pre',
  'script',
  'style',
  'textarea',
  'svg'
].join(',');

const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label'] as const;
const textOrigins = new WeakMap<Text, TextRecord>();
const attrOrigins = new WeakMap<Element, Map<string, AttrRecord>>();

export function normalizeLanguage(value: unknown): Language {
  return value === 'zh-CN' ? 'zh-CN' : 'en';
}

export function cachedLanguage(): Language {
  try {
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return 'en';
  }
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function isChinese(): boolean {
  return currentLanguage === 'zh-CN';
}

/** English/Chinese text for code that generates strings instead of rendering static markup. */
export function t(en: string, zh: string): string {
  return isChinese() ? zh : en;
}

export function setI18nLanguage(language: Language): void {
  currentLanguage = normalizeLanguage(language);
  const root = document.documentElement;
  root.lang = currentLanguage;
  root.dataset.language = currentLanguage;
  translateUI();
}

function zhRelative(text: string): string {
  const value = String(text).trim();
  const short = value.match(/^(\d+)(m|h|d|mo|y) ago$/);
  if (short) {
    const unit = { m: '分钟', h: '小时', d: '天', w: '周', mo: '个月', y: '年' }[short[2] as 'm' | 'h' | 'd' | 'w' | 'mo' | 'y'];
    return `${short[1]} ${unit}前`;
  }
  const long = value.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s? ago$/i);
  if (long) {
    const unit = {
      second: '秒', minute: '分钟', hour: '小时', day: '天', week: '周', month: '个月', year: '年'
    }[long[2].toLowerCase() as 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'];
    return `${long[1]} ${unit}前`;
  }
  if (value === 'just now') return '刚刚';
  if (value === 'yesterday') return '昨天';
  if (value === 'never') return '从未';
  return value;
}

function translateCore(core: string): string | null {
  const exact = ZH[core];
  if (exact) return exact;
  for (const [pattern, replace] of ZH_PATTERNS) {
    const match = core.match(pattern);
    if (match) return replace(match);
  }
  return null;
}

function translateTextValue(raw: string): string | null {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
  if (!match) return null;
  const core = match[2];
  if (!core) return null;
  const translated = translateCore(core);
  if (translated == null) return null;
  const leading = /^[（，。；：！？]/.test(translated) ? '' : match[1];
  return leading + translated + match[3];
}

function translateAttributeValue(value: string): string | null {
  const exact = ZH_ATTR[value] || ZH[value];
  if (exact) return exact;
  for (const [pattern, replace] of ZH_ATTR_PATTERNS) {
    const match = value.match(pattern);
    if (match) return replace(match);
  }
  return null;
}

function translateTextNode(node: Text): void {
  const parent = node.parentElement;
  if (!parent || parent.closest(I18N_SKIP_SELECTOR)) return;
  const current = node.nodeValue || '';
  if (!current.trim()) return;
  const record = textOrigins.get(node);

  if (currentLanguage === 'en') {
    if (!record) return;
    if (current === record.translated) {
      node.nodeValue = record.source;
    } else if (current !== record.source) {
      textOrigins.set(node, { source: current, translated: current });
    }
    return;
  }

  const source = record && current === record.translated ? record.source : current;
  const translated = translateTextValue(source);
  if (translated == null || translated === source) {
    if (record) textOrigins.delete(node);
    return;
  }
  textOrigins.set(node, { source, translated });
  if (current !== translated) node.nodeValue = translated;
}

function translateAttribute(el: Element, attr: string): void {
  if (el.closest('pre, code, script, style, svg')) return;
  const current = el.getAttribute(attr);
  if (current == null || !current.trim()) return;
  let records = attrOrigins.get(el);
  if (!records) {
    records = new Map<string, AttrRecord>();
    attrOrigins.set(el, records);
  }
  const record = records.get(attr);

  if (currentLanguage === 'en') {
    if (!record) return;
    if (current === record.translated) {
      el.setAttribute(attr, record.source);
    } else if (current !== record.source) {
      records.set(attr, { source: current, translated: current });
    }
    return;
  }

  const source = record && current === record.translated ? record.source : current;
  const translated = translateAttributeValue(source);
  if (translated == null || translated === source) {
    if (record) records.delete(attr);
    return;
  }
  records.set(attr, { source, translated });
  if (current !== translated) el.setAttribute(attr, translated);
}

function translateAttributes(root: Element | DocumentFragment): void {
  const elements: Element[] = [];
  if (root.nodeType === Node.ELEMENT_NODE) elements.push(root as Element);
  root.querySelectorAll('[placeholder], [title], [aria-label]').forEach((el) => elements.push(el));
  for (const el of elements) {
    for (const attr of TRANSLATABLE_ATTRIBUTES) translateAttribute(el, attr);
  }
}

function translateTree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  const container = root as Element | DocumentFragment;
  translateAttributes(container);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    translateTextNode(node as Text);
    node = walker.nextNode();
  }
}

export function translateUI(): void {
  if (!document.body) return;
  translateTree(document.body);
}

export function startI18nObserver(): void {
  if (observer || !document.body) return;
  observer = new MutationObserver((mutations) => {
    if (currentLanguage !== 'zh-CN') return;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => translateTree(node));
      } else if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
        translateAttributes(mutation.target as Element);
      } else if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
        translateTextNode(mutation.target as Text);
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    characterData: true
  });
}
