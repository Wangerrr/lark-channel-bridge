# lark-channel-bridge-wg1

Bridge Feishu / Lark chat to a local Claude Code, Codex, or OpenCode process. DM the bot or `@bot` in a group; the agent runs on your machine and replies in chat.

This is an independently maintained fork of `lark-channel-bridge@0.7.1`. It is **not** a ByteDance / Feishu product and is not affiliated with upstream `zarazhangrui/lark-coding-agent-bridge`. The CLI is `lark-channel-bridge-wg1` so it does not collide with the Homebrew package.

[中文](./README.zh.md) · [Changelog](./CHANGELOG.md)

## What this fork changes

- **Quoted images reach the model.** In a group, send an image, quote it, then `@bot`. The quoted message’s files are downloaded and passed to Codex/OpenCode as `--image`. That is the only way to @ the bot with a picture on mobile.
- **Text mode does not treat progress as the answer.** Openers like “先选几部…再找海报” are not posted as the whole reply. If there is no final message, the bridge says so instead of faking completion.
- **OpenCode** can be a profile agent.
- Launchd / systemd inherit TLS CA env (`NODE_EXTRA_CA_CERTS` / `SSL_CERT_FILE`) so Feishu still connects behind corporate MITM CAs.

Config stays in `~/.lark-channel` (schema v2, compatible with 0.7.1). Do **not** run this and official 0.7.1 against the same profile at the same time.

## Still not done

- The official text-mode reply **cannot attach images**. If the agent wants pictures in the group, it still has to call `lark-cli` itself.
- Quote handling is one hop: only the message being replied to, not a full A→B→C chain.
- Not published to npm. Build from this repo.

## Prerequisites

- Node.js >= 20.12.0
- At least one of `claude`, `codex`, or `opencode` installed and logged in
- A Feishu / Lark PersonalAgent app (QR wizard on first `run`, or pass `--app-id`)

## Run from source

```bash
git clone git@github.com:Wangerrr/lark-channel-bridge.git
cd lark-channel-bridge
git checkout dev
pnpm install
pnpm build
./bin/lark-channel-bridge-wg1.mjs run --profile codex
```

First run writes `~/.lark-channel/config.json`. Switch the working directory later with `/cd <path>` in chat.

Existing app:

```bash
./bin/lark-channel-bridge-wg1.mjs run --profile <name> --agent codex --app-id cli_xxx
```

For Lark (international) add `--tenant lark`.

## Background service

After a foreground `run` works, Ctrl-C, then:

```bash
./bin/lark-channel-bridge-wg1.mjs start --profile codex
./bin/lark-channel-bridge-wg1.mjs status --profile codex
./bin/lark-channel-bridge-wg1.mjs stop --profile codex
```

macOS label: `ai.lark-channel-bridge-wg1.bot.<profile>`.  
Logs: `~/.lark-channel/profiles/<profile>/logs/` (daemon stdout/stderr under `logs/daemon/`).

One OS service per profile. Two processes must not share a profile.

## Chat usage

| | |
|---|---|
| DM | just send |
| Group | `@bot` by default |
| Images | send to the bot, or **quote the image then @** |
| Stop | `/stop` |
| New session | `/new` |
| cwd | `/cd /path/to/project` |
| Access | `/invite user @them`, `/invite group` in a group |

Default access is allowlist. Empty list means nobody except the app owner. Admins bypass the group list.

## Troubleshooting

**No replies** — local CLI not logged in, or cwd missing. Send `/status`.

**Quoted image ignored** — you are probably still on Homebrew `lark-channel-bridge`. This fork should log `quote fetched` with `resources >= 1` and spawn with `images: 1`.

**`self-signed certificate in certificate chain`** — run `start` once so the plist picks up `/etc/ssl/cert.pem`. Don’t hand-edit the plist and then overwrite it with `start`.

## Development

```bash
pnpm test
pnpm typecheck
pnpm build
```

CI runs that on macOS, Ubuntu, and Windows with a frozen lockfile. No telemetry unless you opt in.

## License

[MIT](./LICENSE)
