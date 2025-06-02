# Goal Mate - AI智能目标管理系统

基于 Next.js + CopilotKit + 阿里云百炼的智能目标和计划管理系统。通过AI助手与系统进行自然语言交互，智能管理你的目标、计划和进度。

## 功能特性

- 🎯 **目标管理**: 创建和管理长期目标，支持标签分类
- 📋 **计划管理**: 制定具体的执行计划，支持难度分级和进度跟踪
- 📊 **进度记录**: 详细记录任务完成情况和思考反思
- 📈 **智能报告**: 自动生成周报、月报等进展报告
- 🤖 **AI助手**: 通过自然语言与系统交互，智能调用各种功能

## AI助手能力

你可以通过自然语言与AI助手对话，它会自动识别意图并调用相应的系统API：

- **智能任务推荐**: "刚下班有点累，我现在能做些什么轻松的事？"
- **进度查询**: "我本年的读书计划完成得如何？"
- **目标创建**: "我想读《DDIA》，这本书难度比较高，你帮我新加一条计划"
- **进度更新**: "我把《CSAPP》第3章读完了，你帮我更新进度"
- **报告生成**: "根据我的目标以及完成事项的记录，按照目标类型来分不同板块，生成本周周报"

## 技术栈

- **前端**: Next.js 15 + React 19 + TypeScript + Tailwind CSS
- **后端**: Next.js API Routes + Prisma ORM
- **数据库**: PostgreSQL
- **AI集成**: CopilotKit + 阿里云百炼 (DeepSeek-R1)
- **UI组件**: Radix UI + shadcn/ui
- **部署**: Docker + Docker Compose

## 快速开始

### 本地开发

#### 1. 环境配置

创建 `.env.local` 文件并配置以下环境变量：

```bash
# 阿里云百炼 API 配置
OPENAI_API_KEY=your_bailian_api_key_here
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# 数据库配置
DATABASE_URL="postgresql://username:password@localhost:5432/goalmate"
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 数据库设置

```bash
# 生成 Prisma 客户端
npx prisma generate

# 运行数据库迁移
npx prisma db push
```

#### 4. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 开始使用。

### 🐳 Docker 部署

#### 快速部署

1. **使用部署脚本（推荐）**:
```bash
# 克隆项目
git clone <your-repo-url>
cd goal-mate

# 运行一键部署脚本
./deploy.sh start
```

2. **手动部署**:
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
nano .env

# 启动服务
docker-compose up -d
```

#### 部署脚本功能

部署脚本 `deploy.sh` 提供了完整的应用管理功能：

```bash
./deploy.sh start    # 检查环境并启动服务
./deploy.sh stop     # 停止所有服务
./deploy.sh restart  # 重启服务
./deploy.sh logs     # 查看应用日志
./deploy.sh backup   # 备份数据库
./deploy.sh status   # 查看服务状态
./deploy.sh cleanup  # 清理Docker资源
```

#### 部署要求

- Docker Engine 20.10+
- Docker Compose v2.0+
- 至少 2GB 内存
- 至少 5GB 磁盘空间

#### 环境变量配置

部署时需要配置以下环境变量：

```bash
# 数据库密码（请设置强密码）
POSTGRES_PASSWORD=your-secure-password-here

# OpenAI API 配置
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1

# 如果使用阿里云通义千问
# OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

详细的部署指南请参考 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 阿里云百炼配置

1. 登录 [阿里云百炼控制台](https://bailian.console.aliyun.com/)
2. 创建应用并获取 API Key
3. 选择 DeepSeek-R1 模型
4. 将 API Key 配置到环境变量 `OPENAI_API_KEY` 中

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── copilotkit/          # CopilotKit API 端点
│   │   ├── goal/                # 目标管理 API
│   │   ├── plan/                # 计划管理 API
│   │   ├── progress_record/     # 进度记录 API
│   │   └── report/              # 报告生成 API
│   ├── goals/                   # 目标管理页面
│   ├── plans/                   # 计划管理页面
│   ├── progress/                # 进度记录页面
│   └── layout.tsx               # 应用布局 (包含 CopilotKit Provider)
├── components/                  # UI 组件
└── lib/                        # 工具函数
```

## API 功能

CopilotKit 集成了以下系统 API 调用能力：

- `queryPlans`: 查询计划列表，支持难度和标签筛选
- `queryGoals`: 查询目标列表
- `queryProgressRecords`: 查询进度记录
- `createGoal`: 创建新目标
- `createPlan`: 创建新计划
- `updatePlanProgress`: 更新计划进度
- `webSearch`: 搜索书籍等信息
- `generateReport`: 生成进展报告

## 开发说明

### 添加新的 AI 功能

1. 在 `src/app/api/copilotkit/route.ts` 中添加新的 action
2. 定义参数和处理逻辑
3. AI 助手会自动识别并调用新功能

### 扩展搜索功能

目前 `webSearch` 使用模拟数据，你可以集成真实的搜索 API：

```typescript
// 集成百度搜索 API 示例
const searchResult = await fetch(`https://api.baidu.com/search?q=${query}`);
```

## 许可证

MIT License
