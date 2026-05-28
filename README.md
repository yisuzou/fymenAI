# Feynman AI (费曼 AI)

> 用提问追溯理解，用复述验证掌握。

一个基于费曼学习法的 AI 辅助学习工具。不是向 AI 学习，而是和 AI 一起学习。

## ✨ 核心功能

- **对话式学习**：向 AI 提问，获得费曼式讲解（简单类比 + 易混淆点）
- **分支追问**：框选 AI 回复中的任意文本，创建追问分支深入探索
- **提问 Tracer**：左侧树状导航，每个问题自动编号（Q1, Q1.1, Q1.1.1...）
- **知识图谱**：右侧思维导图视图，可视化提问结构和学习路径
- **费曼检验**：用自己的话复述概念，AI 评分并给出反馈（正确/缺失/错误）

## 🚀 快速开始

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入 API Key

# 启动开发服务器
pnpm dev
```

访问 [http://localhost:3456](http://localhost:3456)

## ⚙️ 环境变量

```env
# OpenAI 兼容 API（支持 MiMo、OpenAI 等）
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.xiaomimimo.com/v1  # 可选，默认 OpenAI
LLM_MODEL=mimo-v2.5-pro

# 或使用 Anthropic
# ANTHROPIC_API_KEY=your-key
# LLM_PROVIDER=anthropic

# 数据库
DB_PATH=./data/feynman.db
```

## 🏗️ 技术栈

- **框架**：Next.js 14 (App Router) + TypeScript
- **状态管理**：Zustand（持久化到 localStorage）
- **数据库**：SQLite (better-sqlite3)
- **LLM**：OpenAI 兼容 API / Anthropic（流式输出）
- **UI**：Tailwind CSS + react-markdown

## 📁 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts         # 流式 LLM 端点
│   │   ├── topics/               # 主题 CRUD
│   │   └── messages/             # 消息 CRUD
│   ├── layout.tsx
│   └── page.tsx                  # 三栏主布局
├── components/
│   ├── chat/
│   │   ├── ConversationView.tsx   # 对话流 + 框选追问
│   │   ├── FeynmanCheck.tsx       # 费曼检验组件
│   │   ├── FeynmanModal.tsx       # 费曼检验浮窗
│   │   ├── Markdown.tsx           # 富文本渲染
│   │   └── SelectionPopover.tsx   # 文本选中弹出
│   └── tracer/
│       ├── Tracer.tsx             # 提问树导航
│       ├── Mindmap.tsx            # 知识图谱视图
│       ├── TopicList.tsx          # 主题列表
│       └── BranchFocusPanel.tsx   # 分支焦点面板
├── lib/
│   ├── llm/                      # LLM 抽象层
│   ├── db/                       # SQLite 数据层
│   ├── store/                    # Zustand stores
│   └── utils/                    # 工具函数
└── tests/
```

## 🧪 测试

```bash
pnpm test:run    # 运行所有测试
pnpm test        # 监听模式
```

## 📦 构建

```bash
pnpm build       # 生产构建
pnpm start       # 启动生产服务器
```

## 📝 License

MIT
