# Changelog

WG1 fork of `lark-channel-bridge@0.7.1`.

## Unreleased

### 功能

- 适配 Grok Build，profile 可用 `--agent grok`。headless 走 `--prompt-file` 和 `streaming-messages-json`，会话用 `--resume`。

### 修复

- OpenCode 失败原因读 `error.data.message`，不再一律显示 `OpenCode run failed`。
- OpenCode 的 workspace（`acceptEdits`）允许读和改文件，并拒绝 shell。之前不传 `--auto`，headless 会把工具权限直接拒绝。
- 引用图片：引用块和话题上下文写上已下载的本地路径，并去掉飞书 file key。

## 0.7.1-wg1.1 — 2026-09-09

### 回退

- text 模式「过程句不当终稿」：恢复上游行为，tool 前的开场白可以再次作为终稿发出。引用图片逻辑未改。

## 0.7.1-wg1.0 — 2026-09-08

### 功能

- 适配 OpenCode，profile 可用 `--agent opencode`

### 修复

- 引用图片不进模型：被引用消息里的图会下载，并作为 `--image` 传给 Codex / OpenCode。手机上「发图 → 引用 → @bot」可用。
- text 模式把过程句当终稿：像「先选几部…再找海报」这种开场白不再整段发出。没有最终回复时会明说没有，而不是假装答完。
