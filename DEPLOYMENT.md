# Goal Mate 应用部署指南

本文档介绍如何使用Docker部署Goal Mate应用到服务器。

## 🐳 Docker部署

### 前置要求

- Docker Engine 20.10+
- Docker Compose v2.0+
- 至少 2GB 内存
- 至少 5GB 磁盘空间

### 快速部署

1. **克隆项目到服务器**
```bash
git clone <your-repo-url>
cd goal-mate
```

2. **创建环境变量文件**
```bash
cp .env.example .env
```

3. **编辑环境变量**
```bash
nano .env
```

设置以下必需的环境变量：
```env
# 数据库密码（请设置强密码）
DATABASE_URL="your-database-url"

# OpenAI API 配置
OPENAI_API_KEY="your-openai-api-key"
OPENAI_BASE_URL="https://api.openai.com/v1"

# 如果使用阿里云通义千问
# OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
```

4. **启动服务**
```bash
docker-compose up -d
```

5. **检查服务状态**
```bash
docker-compose ps
docker-compose logs app
```

### 单独构建Docker镜像

如果只想构建应用镜像：

```bash
# 构建镜像
docker build -t goal-mate .

# 运行容器（需要单独运行数据库）
docker run -p 3000:3000 \
  -e DATABASE_URL="your-database-url" \
  -e OPENAI_API_KEY="your-api-key" \
  goal-mate
```

## 🚀 生产环境建议

### 1. 安全配置

- 使用强密码设置 `POSTGRES_PASSWORD`
- 将敏感环境变量存储在安全的地方
- 配置防火墙，只开放必要端口（3000, 22）
- 使用 HTTPS 反向代理（Nginx/Caddy）

### 2. 更新应用

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose up -d --build
```

## 🔧 故障排除

### 常见问题

1. **容器启动失败**
   - 检查环境变量是否正确设置
   - 确保端口3000和5432未被占用
   - 查看容器日志：`docker-compose logs`

2. **数据库连接失败**
   - 确保 `DATABASE_URL` 正确
   - 检查数据库容器是否正常运行
   - 验证数据库密码

3. **构建失败**
   - 确保有足够的磁盘空间
   - 检查网络连接（下载依赖）
   - 清理Docker缓存：`docker system prune`

### 性能优化

1. **限制容器资源**
```yaml
# 在 docker-compose.yml 中添加
services:
  app:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
```

2. **数据库调优**
```yaml
postgres:
  environment:
    POSTGRES_SHARED_PRELOAD_LIBRARIES: pg_stat_statements
    POSTGRES_MAX_CONNECTIONS: 100
    POSTGRES_SHARED_BUFFERS: 256MB
```

## 📝 环境变量说明

| 变量名 | 说明 | 必需 | 默认值 |
|--------|------|------|--------|
| `DATABASE_URL` | PostgreSQL连接字符串 | ✅ | - |
| `POSTGRES_PASSWORD` | 数据库密码 | ✅ | - |
| `OPENAI_API_KEY` | OpenAI API密钥 | ✅ | - |
| `OPENAI_BASE_URL` | OpenAI API基础URL | ❌ | https://api.openai.com/v1 |
| `PORT` | 应用端口 | ❌ | 3000 |
| `NODE_ENV` | 运行环境 | ❌ | production |

## 🌐 Nginx反向代理配置

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

现在你的Goal Mate应用可以轻松部署到任何支持Docker的服务器上了！🎉 