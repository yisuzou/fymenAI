# Feynman AI (费曼 AI)

> 用提问追溯理解，用复述验证掌握。

一个基于费曼学习法的 AI 辅助学习工具。不是向 AI 学习，而是和 AI 一起学习。

## ✨ 核心功能

- **对话式学习**：向 AI 提问，获得费曼式讲解（简单类比 + 易混淆点）
- **分支追问**：框选 AI 回复中的任意文本，创建追问分支深入探索
- **提问 Tracer**：左侧树状导航，每个问题自动编号（Q1, Q1.1, Q1.1.1...）
- **知识图谱**：右侧思维导图视图，可视化提问结构和学习路径
- **费曼检验**：用自己的话复述概念，AI 评分并给出反馈（正确/缺失/错误）
- **界面内配置**：⚙️ 里直接填 provider / 模型 / API Key，带「测试连接」，保存即生效

## 🚀 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

访问 [http://localhost:3456](http://localhost:3456)

默认走 `mock` provider，**不用任何 API Key 就能把整个界面跑通**。要接真实模型，点左栏
「主题」旁的 ⚙️ 填 provider 和 Key 就行（也可以用环境变量，见下方「配置」）。

> **部署形态**：数据层用的是 better-sqlite3（原生模块 + 本地文件），因此本项目只能
> **自托管在有持久磁盘的 Node 环境**（自己的服务器、VPS、Docker、本机），不能部署到
> Vercel / Cloudflare 等 Serverless 或 Edge 运行时。

## ⚙️ 配置

有两个入口，界面里改的优先：

**1. 界面（推荐）** —— 左栏「主题」表头旁的 ⚙️ 图标打开「API 配置」，可以改
provider、模型、Base URL、Max tokens、API Key，**保存后立即生效，不用重启**。
还有一个「测试连接」按钮，会用当前保存的配置真的发一次极短请求，把结果分类成
「Key 无效 / 模型不存在 / 连不上 / provider 限流」等，原始错误只留在服务端日志。

**2. 环境变量** —— 见 [`.env.example`](./.env.example)，作为界面没设置时的兜底。

优先级是 **界面设置 > 环境变量 > 内置默认值**。配置弹窗里每一项都标了当前值来自
哪一层（`来自设置` / `来自环境变量` / `默认值`），把界面里的某项清空即回落到环境变量。

| 变量 | 说明 |
| --- | --- |
| `LLM_PROVIDER` | `openai` \| `anthropic` \| `mock`（默认 `mock`，不需要 Key） |
| `LLM_MODEL` | 对应 provider 的模型 id |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | 只需填所选 provider 的那一个 |
| `OPENAI_BASE_URL` | OpenAI 兼容网关（如 MiMo）；留空则用 api.openai.com |
| `LLM_MAX_TOKENS` | 单次回复上限（Anthropic 生效，默认 2048） |
| `DB_PATH` | SQLite 文件路径，默认 `./data/feynman.db`，首次运行自动创建 |
| `APP_TOKEN` | 可选共享密钥，见下方「访问控制」 |

### API Key 存在哪里

界面里填的 Key 写进服务端 SQLite 的 `settings` 表，**明文**，安全级别等同于把它写在
`.env.local` 里 —— 能读到那台机器磁盘的人就能读到 Key。没有加密，因为解密用的密钥
只能存在同一台机器上，那不解决任何实际问题。

`GET /api/settings` **永远不返回 Key**，只返回「有没有配」和末四位提示
（`····a1b2`）。两个 provider 的 Key 分开存，来回切换不会丢掉另一个。

### 访问控制

所有 `/api/*` 都启用两道防线：

- **请求上限**：单条消息 8000 字符、单次最多 64 条、总量 60000 字符，超出返回 400
- **限流**：单客户端每分钟 20 次，超出返回 429（进程内固定窗口，重启即清空）。
  `/api/settings` 和 `/api/settings/test` 各用独立的计数桶，打开配置弹窗不会占用
  对话额度；`/api/settings/test` 收得更紧（每分钟 5 次），因为它每次都真的花 token

一旦设置了 `APP_TOKEN`，所有接口都要求请求头 `Authorization: Bearer <APP_TOKEN>`，
否则返回 401；网页端会在配置弹窗里问你要这个 token，只存在浏览器本地。

本地开发不设置即可零配置使用；**把本应用暴露到公网前请务必设置** —— 项目没有登录
系统，这个 token 是公网和你的 API Key 之间唯一的一道门。而且现在配置也可写：不设
`APP_TOKEN` 时，任何能打开页面的人都能改 provider / Base URL、用你的 Key，
配置弹窗里会显示一条黄色警告提醒这一点。

`/api/settings/test` 只用**已保存的**配置发请求，不接受请求体里传入的地址，所以它
不是一个任意出站请求工具；不过能改配置的人本来就能把 `/api/chat` 指到任意地址，
所以它并没有放大权限 —— 这也正是 `APP_TOKEN` 重要的原因。

## 🧱 数据与协议

- **数据库迁移**：`src/lib/db/index.ts` 里维护一份 `MIGRATIONS` 列表，用
  `PRAGMA user_version` 记录进度，每条迁移在事务内执行且只执行一次
- **流式协议**：`/api/chat` 返回 NDJSON，每行一个事件
  —— `{"t":"delta","v":"…"}`、`{"t":"error","code","message"}`、`{"t":"done"}`。
  请求级失败是真正的 HTTP 状态码 + JSON 错误体；流中失败是 `error` 事件，
  不会被当成回复内容写进数据库，原始 provider 错误只留在服务端日志里

## 🖥️ 布局

- **≥ lg**：左「提问 Tracer」/ 中「对话」/ 右「知识图谱・分支焦点」三栏，右栏可拖动改宽
- **< lg**：单栏 + 底部 tab 栏（🌳 树 / 💬 对话 / 🔍 焦点），纯 CSS 断点切换，
  不依赖 `matchMedia`，因此没有 SSR 水合不一致

## 🏗️ 技术栈

- **框架**：Next.js 16 (App Router) + React 19 + TypeScript（strict）
- **状态管理**：Zustand 5 —— 主题列表与 UI 偏好持久化到 localStorage，
  消息内容只在内存，始终以 SQLite 为准
- **数据库**：SQLite (better-sqlite3, WAL) + 版本化迁移
- **LLM**：OpenAI 兼容 API / Anthropic / mock（流式输出）
- **校验**：Zod 4（所有 API 入口）
- **UI**：Tailwind CSS 4 + react-markdown
- **测试**：Vitest 4 + Testing Library

## 📁 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts          # 流式 LLM 端点（NDJSON）
│   │   ├── settings/              # 运行时 LLM 配置读写 + 测试连接
│   │   ├── topics/                # 主题 CRUD
│   │   └── messages/              # 消息 CRUD（含级联删除）
│   ├── layout.tsx
│   └── page.tsx                   # 响应式主布局 + 底部 tab
├── components/
│   ├── chat/
│   │   ├── ConversationView.tsx   # 对话流 + 框选追问
│   │   ├── ChatInput.tsx          # 输入框（流式中可停止）
│   │   ├── BranchBadge.tsx        # 分支入口徽标
│   │   ├── FeynmanCheck.tsx       # 费曼检验组件
│   │   ├── FeynmanModal.tsx       # 费曼检验浮窗
│   │   ├── Markdown.tsx           # 富文本渲染
│   │   └── SelectionPopover.tsx   # 文本选中弹出
│   ├── settings/
│   │   └── SettingsModal.tsx      # API 配置弹窗
│   └── tracer/
│       ├── Tracer.tsx             # 提问树导航
│       ├── Mindmap.tsx            # 知识图谱视图
│       ├── TopicList.tsx          # 主题列表（含 ⚙️ 配置入口）
│       └── BranchFocusPanel.tsx   # 分支焦点面板
├── lib/
│   ├── api/                       # 入参校验、限流、鉴权、NDJSON 流、带 token 的 fetch
│   ├── llm/                       # LLM 抽象层 + 三层配置解析 + prompts
│   ├── db/                        # SQLite 数据层 + 迁移
│   ├── store/                     # Zustand stores + actions
│   ├── tree.ts                    # 提问树构建与编号
│   └── utils/                     # 工具函数（grader 等）
└── tests/unit/                    # 单元测试
```

## 🧪 测试

```bash
pnpm test:run    # 运行所有测试
pnpm test        # 监听模式
pnpm lint        # ESLint
```

覆盖重点：提问树编号与嵌套（`tree.test.ts`）、评分 JSON 提取（`grader.test.ts`）、
级联删除与迁移幂等（`queries.test.ts`）、NDJSON 半行缓冲与错误帧隔离
（`stream.test.ts`）、`/api/chat` 的 200/400/401/429（`chat-route.test.ts`）、
三层配置优先级与「Key 不出现在任何序列化结果里」（`settings.test.ts`）、
配置读写的三种字段语义与 provider 错误分类（`settings-route.test.ts`）。

## 📦 构建

```bash
pnpm build       # 生产构建
pnpm start       # 启动生产服务器
```

## 📝 License

MIT
