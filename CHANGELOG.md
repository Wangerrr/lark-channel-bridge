# Changelog

WG1 fork of `lark-channel-bridge@0.7.1`.

## 0.7.1-wg1.0 — 2026-09-08

### 功能

- 适配 OpenCode，profile 可用 `--agent opencode`

### 修复

- 引用图片不进模型：被引用消息里的图会下载，并作为 `--image` 传给 Codex / OpenCode。手机上「发图 → 引用 → @bot」可用。
- text 模式把过程句当终稿：像「先选几部…再找海报」这种开场白不再整段发出。没有最终回复时会明说没有，而不是假装答完。
