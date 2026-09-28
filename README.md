# lark-channel-bridge-wg1

`lark-channel-bridge-wg1` connects a Feishu or Lark conversation to a coding agent running on the host. Direct messages, and group messages that mention the bot, are executed locally. The agent's reply is posted back to the same chat.

This repository is an independently maintained fork of `lark-channel-bridge` 0.7.1. It is not a ByteDance or Feishu product, and it is not affiliated with the upstream project [`zarazhangrui/lark-coding-agent-bridge`](https://github.com/zarazhangrui/lark-coding-agent-bridge). The command is named `lark-channel-bridge-wg1` so that it does not conflict with the Homebrew package of the upstream project.

[中文](./README.zh.md) · [Changelog](./CHANGELOG.md)

## Capabilities

The fork retains the 0.7.1 configuration layout and adds the following.

- **Quoted images.** In a group, send an image, quote that message, then mention the bot. The bridge downloads the quoted message's files, writes each local path into the quoted block, and removes the Feishu file key so the agent does not try to fetch it. Codex also receives the image on `--image`. OpenCode receives it on `--file`; in local mode that flag attaches the file as text, not as vision input. Claude and Grok read the local path. On mobile, quoting the image is the only way to mention the bot together with a picture.
- **Additional agents.** A profile may use Claude Code, Codex, OpenCode (`--agent opencode`), or Grok Build (`--agent grok`).
- **Corporate TLS.** launchd and systemd units inherit `NODE_EXTRA_CA_CERTS` and `SSL_CERT_FILE`, so the Feishu connection can use a corporate certificate authority.

Configuration remains in `~/.lark-channel` (schema version 2, compatible with 0.7.1). Do not run this fork and the upstream 0.7.1 package against the same profile at the same time.

## Requirements

- Node.js 20.12.0 or newer
- One installed and authenticated agent: `claude`, `codex`, `opencode`, or `grok`
- A Feishu or Lark PersonalAgent application. The first `run` can create one with the QR wizard, or an existing application can be supplied with `--app-id`

Grok Build must be signed in (`grok login`) or provided with `XAI_API_KEY`. A non-default binary may be selected with `LARK_CHANNEL_GROK_BIN` or `LARK_CHANNEL_OPENCODE_BIN`.

## Install and run

```bash
git clone git@github.com:Wangerrr/lark-channel-bridge.git
cd lark-channel-bridge
pnpm install
pnpm build
./bin/lark-channel-bridge-wg1.mjs run --profile codex
```

The first run writes `~/.lark-channel/config.json`. Change the working directory later from chat with `/cd <path>`.

An existing application:

```bash
./bin/lark-channel-bridge-wg1.mjs run --profile <name> --agent codex --app-id cli_xxx
```

For Lark (international), add `--tenant lark`. Create a Grok profile with `--agent grok`, or an OpenCode profile with `--agent opencode`.

## Service

After a foreground `run` succeeds, stop it and install the platform service:

```bash
./bin/lark-channel-bridge-wg1.mjs start --profile codex
./bin/lark-channel-bridge-wg1.mjs status --profile codex
./bin/lark-channel-bridge-wg1.mjs stop --profile codex
```

On macOS the launchd label is `ai.lark-channel-bridge-wg1.bot.<profile>`. Logs are written to `~/.lark-channel/profiles/<profile>/logs/`, with daemon stdout and stderr under `logs/daemon/`.

Each profile has its own service. Two processes must not share a profile.

## Chat

| Action | Command |
|---|---|
| Direct message | Send the message. A mention is not required. |
| Group message | Mention the bot. This is the default. |
| Image | Send it to the bot, or quote the image and then mention the bot. |
| Stop the current run | `/stop` |
| Start a new session | `/new` |
| Change the working directory | `/cd /path/to/project` |
| Grant access | `/invite user @name`, or `/invite group` in a group |

Access is allowlist-based. An empty list admits nobody except the application owner. Group administrators are not subject to the group allowlist.

## Limitations

- A text-mode reply cannot attach images. If the agent needs to post a picture, it must call `lark-cli` itself.
- Quote handling covers the message being replied to, not an A→B→C chain of quotes.
- The package is not published to npm. Build it from this repository.

## Troubleshooting

**The bot does not reply.** The local agent is not authenticated, or the working directory does not exist. Send `/status`.

**A quoted image is ignored.** Confirm that this fork is running, not the Homebrew package `lark-channel-bridge`. The log should contain `quote fetched` with `resources >= 1`. Codex and OpenCode runs should also show the image path in the spawn arguments.

**`self-signed certificate in certificate chain`.** Run `start` so the service definition picks up `/etc/ssl/cert.pem`. Do not edit the plist by hand and then overwrite it with `start`.

## Development

```bash
pnpm test
pnpm typecheck
pnpm build
```

Continuous integration runs those three commands on macOS, Ubuntu, and Windows, after `pnpm install --frozen-lockfile`. Telemetry is disabled unless explicitly enabled.

## License

[MIT](./LICENSE)
