# Changelog

WG1 fork of `lark-channel-bridge@0.7.1`. Independent of upstream `zarazhangrui/lark-coding-agent-bridge`.

## 0.7.1-wg1.0 — 2026-09-08

### Fork / identity

- Package and CLI renamed to `lark-channel-bridge-wg1` so it does not collide with Homebrew `lark-channel-bridge@0.7.1`.
- Launchd / systemd service names are `lark-channel-bridge-wg1.bot.*`.
- Config home remains `~/.lark-channel` (schema v2, compatible with 0.7.1). Set `LARK_CHANNEL_HOME` to isolate.
- OpenCode adapter included (`--agent opencode`).

### Quoted inbound images

- Reply-quotes now keep `resources` from the quoted message.
- Quoted / topic-context images and files are downloaded before `media.resolve` and passed to Codex/OpenCode as `--image`.
- Phone flow **send image → quote → @bot** works. Nested quote-chains are still one hop (the message being replied to).

### Daemon TLS

- Launchd (and systemd) forward `NODE_EXTRA_CA_CERTS` / `SSL_CERT_FILE` (and proxy env if set).
- Defaults to `/etc/ssl/cert.pem` when present, so corporate MITM CAs do not break Feishu WS on macOS.

### Final reply (text mode)

- Do not treat pre-tool progress (`先…` / `正在…`) as the whole answer when `last_agent_message` is empty.
- Prefer `finalText`, then text after the last tool.
- If the run finished with only progress commentary, send a short notice instead of the stub, and log `outbound empty-final-notice`.

### Not in this release

- Native outbound image attach in `messageReply: text` (agent still uses `lark-cli` to post images).
- Recursive quote-chain image walking.
