# lark-channel-bridge-wg1

把飞书消息接到本机 Claude Code / Codex / OpenCode。群里 `@bot` 或私聊发话，本机 agent 干活，结果回飞书。

这是独立维护的 fork，基于 `lark-channel-bridge@0.7.1`，**不是**字节/飞书官方，也和上游 `zarazhangrui/lark-coding-agent-bridge` 无关。命令行叫 `lark-channel-bridge-wg1`，不会和 Homebrew 那份抢名字。

[English](./README.md) · [修订记录](./CHANGELOG.md)

## 和上游不一样的地方

- **引用图片会进模型。** 群里「发图 → 引用 → @bot」会把被引用消息的图下载下来，Codex/OpenCode 走 `--image`。手机只能这么 @，这条必须通。
- **OpenCode** 可以作为 profile 的 agent。
- launchd/systemd 会带上本机 TLS CA（`NODE_EXTRA_CA_CERTS` / `SSL_CERT_FILE`），公司证书链下飞书连得上。

配置目录仍是 `~/.lark-channel`（schema v2，和 0.7.1 兼容）。不要和官方 0.7.1 **同时**跑同一个 profile。

## 还做不到

- text 模式的正式回复**不能附图**。模型若要往群里塞图，仍然得自己调 `lark-cli`。
- 引用链只看**直接父消息**，不会顺着 A→B→C 把每一跳的图都拉下来。
- 没发到 npm。从本仓库构建。

## 前置

- Node.js >= 20.12.0
- 本机已登录其中一个：`claude` / `codex` / `opencode`
- 一个飞书 PersonalAgent 应用（首次 `run` 可以扫码建，也可以 `--app-id` 用现成的）

## 从源码跑

```bash
git clone git@github.com:Wangerrr/lark-channel-bridge.git
cd lark-channel-bridge
git checkout dev
pnpm install
pnpm build
./bin/lark-channel-bridge-wg1.mjs run --profile codex
```

第一次会扫码或要 App Secret，写进 `~/.lark-channel/config.json`。工作目录事后在飞书里 `/cd <path>`。

已有应用：

```bash
./bin/lark-channel-bridge-wg1.mjs run --profile <name> --agent codex --app-id cli_xxx
```

国际版 Lark 加 `--tenant lark`。

## 后台（launchd / systemd）

前台跑通之后 `Ctrl-C`，再：

```bash
./bin/lark-channel-bridge-wg1.mjs start --profile codex
./bin/lark-channel-bridge-wg1.mjs status --profile codex
./bin/lark-channel-bridge-wg1.mjs stop --profile codex
```

macOS 服务名：`ai.lark-channel-bridge-wg1.bot.<profile>`。  
日志：`~/.lark-channel/profiles/<profile>/logs/`（daemon 子目录是 stdout/stderr）。

多个 bot 就多个 profile，各起一个 `start --profile`。不要两个进程抢同一个 profile。

## 飞书里怎么用

| 场景 | 做法 |
|---|---|
| 私聊 | 直接发，不用 @ |
| 群 | 默认要 @bot |
| 看图 | 把图发给 bot，或**引用那张图再 @** |
| 停当前任务 | `/stop` |
| 新开会话 | `/new` |
| 换目录 | `/cd /path/to/project` |
| 谁能用 | `/invite user @他`、群里 `/invite group` |

群默认白名单模式：没在名单里的人/群，消息会丢掉。只有创建者（应用所有者）一开始就能用。管理员不受群名单限制。

## 常见故障

**完全没回复**  
本机 CLI 没登录，或 cwd 不存在。飞书发 `/status`。

**引用了图却像没看见**  
确认跑的是这份 WG1，不是 Homebrew `lark-channel-bridge`。看日志里有没有 `quote fetched` + `resources >= 1` + `images: 1`。

**公司网络 TLS 报 self-signed certificate**  
`start` 一次，让 plist 带上 `/etc/ssl/cert.pem`。不要手改完再被 `start` 覆盖。

## 开发

```bash
pnpm test
pnpm typecheck
pnpm build
```

CI：macOS / Ubuntu / Windows，frozen lockfile + test + typecheck + build。

默认不上报任何遥测。

## 许可

[MIT](./LICENSE)
