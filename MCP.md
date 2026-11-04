# Goal Mate 远程 MCP

入口：`https://<你的域名>/api/mcp`。使用官方 MCP SDK 的 Streamable HTTP 传输，供 Codex 等支持远程 MCP 的客户端读取、创建和更新 Goal Mate 数据。MCP 使用独立 Bearer 令牌，网页登录 Cookie 不能访问此入口。

## 服务端配置

服务进程需要以下环境变量：

| 变量 | 用途 |
| --- | --- |
| `GOAL_MATE_MCP_TOKEN_SHA256` | 专用 MCP 令牌的 SHA-256 十六进制摘要，严格 64 个字符，大小写均可。缺失或格式错误时返回 503。 |
| `AUTH_USERNAME` | 现有 Goal Mate 登录用户名；内部调用时用于生成签名登录 Cookie。 |
| `AUTH_SECRET` | 现有登录签名密钥。MCP 不使用登录密码，也不把 Bearer 令牌转发给 REST。 |
| `PORT` | 同一 Next.js 服务监听端口，未设置时为 3000。必须是 1–65535 的数字。 |

在仓库以外的私有目录生成令牌及摘要文件（命令不打印令牌，文件已存在时拒绝覆盖）：

```sh
umask 077
node <<'NODE'
const { randomBytes, createHash } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const token = randomBytes(32).toString('base64url');
writeFileSync('goal-mate-mcp-token.txt', token + '\n', { mode: 0o600, flag: 'wx' });
const hash = createHash('sha256').update(token).digest('hex');
writeFileSync('goal-mate-mcp-server.env', 'GOAL_MATE_MCP_TOKEN_SHA256=' + hash + '\n', { mode: 0o600, flag: 'wx' });
NODE
```

客户端保存原始令牌，服务端只配置摘要。摘要计算不包含文件末尾换行。不要把令牌、登录配置或生成的文件提交到 Git。令牌轮换时重新生成一对值，更新服务端摘要并重启，再更新客户端令牌；移除服务端摘要并重启即可禁用入口。

MCP 请求仅转到固定 `http://127.0.0.1:${PORT}/api/...`。路径与方法有白名单，拒绝重定向，不接受调用者的主机、URL 或 Cookie。此方式需要 MCP 与 REST 运行在同一常驻 Next.js 服务中，不能直接移植到独立的无服务器函数；反向代理的 HTTPS 入口应保留 Authorization 请求头。

## Codex 连接

在 Codex 能继承的环境里设置 `GOAL_MATE_MCP_TOKEN`，值为原始令牌，然后在用户级 `~/.codex/config.toml` 添加：

```toml
[mcp_servers.goal_mate]
url = "https://<你的域名>/api/mcp"
bearer_token_env_var = "GOAL_MATE_MCP_TOKEN"
```

也可以用 CLI 注册：

```sh
codex mcp add goal_mate --url 'https://<你的域名>/api/mcp' --bearer-token-env-var GOAL_MATE_MCP_TOKEN
```

桌面应用从图形界面启动时不一定继承终端环境变量。需要让应用启动环境提供该变量，或在私有用户配置中使用 `http_headers = { Authorization = "Bearer <原始令牌>" }`，并将配置文件权限限制为 `0600`。两种认证配置选择一种；示例中的占位值不能直接使用。重启客户端后检查 MCP 工具是否出现。配置字段见 [OpenAI 官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。

## 工具与数据约定

| 范围 | 工具 |
| --- | --- |
| 目标 | `list_goals`、`create_goal`、`update_goal` |
| 计划 | `list_plans`、`create_plan`、`update_plan` |
| 进展 | `list_progress`、`create_progress` |
| 工作区与统计 | `get_today`、`list_tags`、`get_journal_month`、`list_trackers`、`get_weekly_report` |
| 规划偏好 | `get_planning_preferences`、`update_planning_preferences` |
| 行动项 | `list_action_items`、`create_action_item`、`update_action_item` |
| 时间块 | `list_schedule_blocks`、`create_schedule_block`、`update_schedule_block`、`cancel_schedule_block`、`complete_schedule_block` |

没有通用 HTTP 工具、删除工具或批量清空工具。读取工具标记 `readOnlyHint: true`；写入工具有相应修改与幂等提示。这些注解只是给客户端的提示，所有参数仍在服务端验证。

- 目标、计划、进展列表默认每页 50 条，上限 100 条，`pageNum` 从 1 开始。保留 REST 的 `total`，客户端需要继续翻页，不能把首屏当作全部数据。其他读取工具按单日、单月、单周或单计划返回完整结果；超过响应限制时明确报错，不会静默截断。
- `progress`、`plan_progress` 都为 **0–1**，例如 50% 应填写 `0.5`。
- `date` 使用有效本地日历日期 `YYYY-MM-DD`，按已保存的规划时区解释；`month` 为 `YYYY-MM`。周报固定按上海时区统计，`weekStart` 应为周一，省略时使用当前上海周。
- 时间块起止和进展 `custom_time` 必须使用带 `Z` 或 `+08:00` 等明确偏移量的 ISO 时间。先读取规划偏好，再将本地时间转换为明确偏移量；时间块仍受现有 15 分钟刻度、单日本地边界、冲突及预算约束。
- 行动项 `due_date` 使用日期字符串。计划 REST 直接接收 Prisma 时间戳，因此计划 `due_date` 使用带偏移量的 ISO 时间，并按 UTC 日期存储；希望到期日为 `2026-10-24` 时应填写 `2026-10-24T00:00:00Z`。可空字段用 `null` 清除。
- 创建进展必须提供稳定 UUID `request_id`。创建时间块、行动项必须提供稳定 `idempotency_key`，它只映射到 HTTP `Idempotency-Key` 请求头；时间块自动记录 `source: ai_chat`。重试同一次逻辑创建必须复用原值和内容，修改内容请使用新的请求标识。
- 时间块更新、取消和完成要求最新 `expected_version`；原样传递给 REST。冲突时先重新读取，不自动提高版本号。计划改归属可附带最新 `expected_goal_id` 进行并发检查。规划偏好接口是全量替换，**没有版本检查**，应先读取再提交完整配置。
- 所有写入均不自动重试。超时或连接中断时，写入可能已经成功。目标和计划创建没有幂等键，先查询确认再决定是否重试；支持幂等的创建则复用原请求标识。

## HTTP 限制与排错

- 每个 POST 都重新认证并创建独立 server/transport，使用 JSON 响应，不分配会话 ID。支持 `initialize`、`tools/list`、`tools/call`；不提供常驻 SSE、断点续传或服务端推送。
- 客户端 POST 应发送 `Content-Type: application/json` 和 `Accept: application/json, text/event-stream`。后续请求应使用 SDK 协商的 `MCP-Protocol-Version`。
- GET、DELETE 和其他非 POST 方法先认证，再返回 405，`Allow: POST`。SDK 客户端探测 GET 收到 405 属于预期行为。
- 不提供浏览器 CORS 接入；任何带 `Origin` 的请求都拒绝，包括 `Origin: null`。不要把专用令牌嵌入网页。
- 错误或缺失 Bearer 为 401，并带 `WWW-Authenticate: Bearer`；服务摘要未配置或错误为 503；已认证浏览器请求为 403。
- 请求体最多 256 KiB；内部 REST 响应最多 2 MiB；内部请求默认 15 秒超时。超限应缩小分页或查询范围。业务 4xx 保留错误码、说明和冲突时间块 ID；5xx 与连接异常不暴露堆栈或内部地址。
- REST 必须可从相同服务的 loopback 访问，`PORT` 必须与实际监听端口一致。缺少现有登录用户名/签名密钥时，工具调用返回配置错误。

## 开发与运维验证

```sh
npm ci
npm run db:generate
npm test -- src/lib/mcp src/app/api/mcp/route.test.ts
npm test -- src/lib/auth-token.test.ts src/middleware.test.ts src/app/api/authentication.test.ts
npm test
npx tsc --noEmit
npx eslint src/lib/mcp src/app/api/mcp src/lib/auth.ts src/lib/auth-token.ts src/lib/api-auth.ts src/middleware.ts
npm run build
node --experimental-global-webcrypto scripts/test-api-auth-http.mjs
```

测试注入内部 fetch 和签名凭据，不依赖在线数据库；协议测试使用真实官方 SDK。Node 18 的 Vitest 需要显式提供 Web Crypto，Next.js 运行时本身已有该兼容层。项目最低 Node 版本保持 18.18，部署沿用 Node 24；SDK 的 Hono Node 适配器间接依赖可能提示 Node 20 要求，此实现使用原生 Web transport，不引入该适配器。

依赖固定为 `@modelcontextprotocol/sdk@1.32.1` 与直接依赖 `zod@3.25.76`。同时将 `@radix-ui/react-tabs` 固定为线上实际使用的 `1.1.21`，避免部署本功能时回退已修复的标签页依赖或引入额外 UI 升级。

部署应先在独立端口验证初始化、工具列表、只读查询与认证失败，再切换正式服务。此功能不需要数据库 schema 变更。

旧 REST 入口的匿名访问问题已修复：中间件移至与 `src/app` 同级的 `src/middleware.ts`，并使用 Next.js 15.5 支持的 Node.js runtime 验证 HS256 签名、有效期与配置用户名；同时每个私有 API 方法在解析请求体、访问数据库或 AI 前独立验证登录会话。只有精确的登录入口和独立 Bearer 鉴权的 `/api/mcp` 属于 API 例外，路径中包含点号或类似登录前缀不会绕过鉴权。诊断响应仅保留 API 密钥是否配置的布尔值，不返回密钥片段。中间件位置与 runtime 规则见 [Next.js 15 官方文档](https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware)。

上述认证测试自动发现所有私有 API 导出方法，并使用真实 JWT 检查缺失、伪造、过期和错误身份等会话；独立 HTTP 验证脚本使用临时测试凭据与不可达数据库，检查生产构建实际执行中间件、登录及 MCP 协议兼容性。
