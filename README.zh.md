# lark-channel-bridge-wg1

`lark-channel-bridge-wg1` 将飞书或 Lark 会话接到本机运行的编码代理。私聊消息，以及群聊中提及机器人的消息，在本机执行；代理的回复发回同一会话。

本仓库是 `lark-channel-bridge` 0.7.1 的独立维护分支，并非字节跳动或飞书的产品，也与上游项目 [`zarazhangrui/lark-coding-agent-bridge`](https://github.com/zarazhangrui/lark-coding-agent-bridge) 无隶属关系。命令名为 `lark-channel-bridge-wg1`，以免与上游的 Homebrew 安装包冲突。

[English](./README.md) · [修订记录](./CHANGELOG.md)

## 能力

本分支保留 0.7.1 的配置布局，并增加以下能力。

- **引用图片。** 在群聊中发送图片，引用该消息，再提及机器人。Bridge 会下载被引用消息中的文件，把本地路径写入引用块，并去掉飞书 file key，避免代理去请求这个 key。Codex 还会通过 `--image` 接收图片。OpenCode 通过 `--file` 接收；在本地模式下，该参数把文件作为文本附件，而不是视觉输入。Claude 与 Grok 读取本地路径。在手机上，引用图片是把图片和提及一起发给机器人的唯一方式。
- **更多代理。** Profile 可以使用 Claude Code、Codex、OpenCode（`--agent opencode`）或 Grok Build（`--agent grok`）。
- **企业 TLS。** launchd 与 systemd 单元会继承 `NODE_EXTRA_CA_CERTS` 和 `SSL_CERT_FILE`，以便在企业证书颁发机构下连接飞书。

配置目录仍为 `~/.lark-channel`（schema 版本 2，与 0.7.1 兼容）。请勿让本分支与上游 0.7.1 同时使用同一个 profile。

## 环境要求

- Node.js 20.12.0 或更高版本
- 已安装并完成登录的代理之一：`claude`、`codex`、`opencode` 或 `grok`
- 一个飞书或 Lark PersonalAgent 应用。首次 `run` 可通过扫码向导创建，也可使用 `--app-id` 指定已有应用

Grok Build 需要先执行 `grok login`，或设置 `XAI_API_KEY`。非默认二进制可通过 `LARK_CHANNEL_GROK_BIN` 或 `LARK_CHANNEL_OPENCODE_BIN` 指定。

## 安装与运行

```bash
git clone git@github.com:Wangerrr/lark-channel-bridge.git
cd lark-channel-bridge
pnpm install
pnpm build
./bin/lark-channel-bridge-wg1.mjs run --profile codex
```

首次运行会写入 `~/.lark-channel/config.json`。之后可在会话中用 `/cd <path>` 更换工作目录。

使用已有应用：

```bash
./bin/lark-channel-bridge-wg1.mjs run --profile <name> --agent codex --app-id cli_xxx
```

国际版 Lark 请追加 `--tenant lark`。创建 Grok profile 使用 `--agent grok`，创建 OpenCode profile 使用 `--agent opencode`。

## 服务

前台 `run` 确认可用后，停止该进程并安装系统服务：

```bash
./bin/lark-channel-bridge-wg1.mjs start --profile codex
./bin/lark-channel-bridge-wg1.mjs status --profile codex
./bin/lark-channel-bridge-wg1.mjs stop --profile codex
```

macOS 上的 launchd 标签为 `ai.lark-channel-bridge-wg1.bot.<profile>`。日志位于 `~/.lark-channel/profiles/<profile>/logs/`，守护进程的标准输出与标准错误位于 `logs/daemon/`。

每个 profile 对应一个服务。两个进程不得共用同一个 profile。

## 会话

| 操作 | 命令 |
|---|---|
| 私聊 | 直接发送，无需提及 |
| 群聊 | 提及机器人。此为默认要求 |
| 图片 | 直接发给机器人，或引用该图片后再提及 |
| 停止当前运行 | `/stop` |
| 新建会话 | `/new` |
| 更换工作目录 | `/cd /path/to/project` |
| 授予访问权限 | `/invite user @name`，或在群内使用 `/invite group` |

访问控制为白名单。名单为空时，除应用所有者外无人可以访问。群管理员不受群白名单限制。

## 限制

- 文本模式的回复不能附带图片。代理若需要在会话中发送图片，须自行调用 `lark-cli`。
- 引用处理只覆盖被直接回复的那一条消息，不会沿 A→B→C 的引用链继续拉取。
- 本包未发布到 npm。请从本仓库构建。

## 故障排除

**机器人没有回复。** 本机代理未登录，或工作目录不存在。发送 `/status` 查看状态。

**引用的图片被忽略。** 请确认运行的是本分支，而不是 Homebrew 包 `lark-channel-bridge`。日志中应有 `quote fetched`，且 `resources >= 1`。Codex 与 OpenCode 的启动参数中还应出现图片路径。

**`self-signed certificate in certificate chain`。** 执行一次 `start`，使服务定义带上 `/etc/ssl/cert.pem`。不要手工修改 plist 后再用 `start` 覆盖。

## 开发

```bash
pnpm test
pnpm typecheck
pnpm build
```

持续集成在 macOS、Ubuntu 与 Windows 上，于 `pnpm install --frozen-lockfile` 之后执行上述三条命令。除非显式开启，否则不会上报遥测数据。

## 许可

[MIT](./LICENSE)
