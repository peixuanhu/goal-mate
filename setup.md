# Goal Mate 设置指南

## 环境配置步骤

### 1. 阿里云百炼配置

1. **注册阿里云账号**
   - 访问 [阿里云官网](https://www.aliyun.com/) 注册账号

2. **开通百炼服务**
   - 登录 [阿里云百炼控制台](https://bailian.console.aliyun.com/)
   - 开通百炼服务（可能需要实名认证）

3. **创建应用**
   - 在百炼控制台创建新应用
   - 选择 DeepSeek-R1 模型
   - 获取 API Key

4. **配置环境变量**
   - 复制项目根目录下的 `.env.example` 为 `.env.local`
   - 将获取的 API Key 填入 `OPENAI_API_KEY`

### 2. 数据库配置

1. **安装 PostgreSQL**
   ```bash
   # macOS
   brew install postgresql
   brew services start postgresql
   
   # Ubuntu/Debian
   sudo apt-get install postgresql postgresql-contrib
   sudo systemctl start postgresql
   
   # Windows
   # 下载并安装 PostgreSQL 官方安装包
   ```

2. **创建数据库**
   ```bash
   # 连接到 PostgreSQL
   psql -U postgres
   
   # 创建数据库
   CREATE DATABASE goalmate;
   
   # 创建用户（可选）
   CREATE USER goalmate_user WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE goalmate TO goalmate_user;
   ```

3. **配置数据库连接**
   - 在 `.env.local` 中配置 `DATABASE_URL`
   ```
   DATABASE_URL="postgresql://postgres:password@localhost:5432/goalmate"
   ```

### 3. 项目启动

1. **安装依赖**
   ```bash
   npm install
   ```

2. **初始化数据库**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

3. **启动开发服务器**
   ```bash
   npm run dev
   ```

4. **访问应用**
   - 打开浏览器访问 [http://localhost:3000](http://localhost:3000)

## 环境变量配置示例

创建 `.env.local` 文件：

```bash
# 阿里云百炼 API 配置
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# 数据库配置
DATABASE_URL="postgresql://postgres:password@localhost:5432/goalmate"
```

## 测试 AI 功能

启动应用后，你可以在右侧的 AI 助手中测试以下对话：

1. **创建目标**
   ```
   我想读《DDIA》，这本书难度比较高，你帮我新加一条计划
   ```

2. **查询任务**
   ```
   刚下班有点累，我现在能做些什么轻松的事？
   ```

3. **更新进度**
   ```
   我把《CSAPP》第3章读完了，你帮我更新进度
   ```

4. **生成报告**
   ```
   根据我的目标以及完成事项的记录，按照目标类型来分不同板块，生成本周周报
   ```

## 常见问题

### Q: API Key 无效
A: 检查阿里云百炼控制台中的 API Key 是否正确，确保已开通 DeepSeek-R1 模型权限

### Q: 数据库连接失败
A: 检查 PostgreSQL 是否正常运行，数据库连接字符串是否正确

### Q: AI 助手无响应
A: 检查网络连接，确保能访问阿里云百炼服务

### Q: 找不到计划
A: 确保已创建一些计划数据，可以通过传统界面或 AI 助手创建

## 进阶配置

### 自定义模型参数

在 `src/app/api/copilotkit/route.ts` 中可以调整模型参数：

```typescript
const serviceAdapter = new OpenAIAdapter({
  // 可以添加更多配置选项
});
```

### 添加新的 AI 功能

1. 在 `runtime` 的 `actions` 数组中添加新的 action
2. 定义参数和处理逻辑
3. AI 助手会自动识别新功能

### 集成真实搜索 API

替换 `webSearch` 中的模拟数据，集成真实的搜索服务：

```typescript
// 示例：集成百度搜索 API
const response = await fetch(`https://api.baidu.com/search?q=${query}`, {
  headers: { 'Authorization': 'Bearer your_api_key' }
});
``` 