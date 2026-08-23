# 🇨🇳 中国服务器快速部署指南

本指南专门为在中国大陆服务器部署 Goal Mate 项目而优化，解决网络慢、镜像拉取困难等问题。

## 🚀 一键快速部署

### 1. 前置要求

```bash
# 安装 Docker (如果未安装)
curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun
sudo systemctl start docker
sudo systemctl enable docker

# 安装 Docker Compose (如果未安装)
sudo curl -L "https://get.daocloud.io/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. 克隆项目

```bash
git clone https://github.com/your-username/goal-mate.git
cd goal-mate
```

### 3. 一键部署

```bash
# 运行优化部署脚本
./deploy-china.sh
```

## 🔧 手动部署步骤

如果一键部署遇到问题，可以按照以下步骤手动部署：

### 1. 配置Docker镜像源

```bash
sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
EOF

sudo systemctl restart docker
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置文件
nano .env
```

配置内容示例：
```env
# 数据库配置
DATABASE_URL="postgresql://postgres:password@localhost:5432/goalmate"

# OpenAI API 配置
OPENAI_API_KEY="your_api_key"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"

# 应用配置
NODE_ENV=production
PORT=3000
```

### 3. 使用优化的构建

```bash
# 使用中国网络优化的配置文件
docker-compose -f docker-compose.china.yml build
docker-compose -f docker-compose.china.yml up -d
```

## ⚡ 性能优化建议

### 1. 使用国内镜像源

已在 `Dockerfile.fast` 中配置：
- npm 镜像：`https://registry.npmmirror.com/`
- Docker Hub 镜像：多个国内镜像源

### 2. 启用Docker BuildKit

```bash
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
```

### 3. 缓存优化

构建时会自动利用：
- Docker 分层缓存
- npm 包缓存
- Prisma 生成缓存

## 🔍 故障排除

### 1. 检查服务状态

```bash
# 查看容器状态
docker-compose -f docker-compose.china.yml ps

# 查看应用日志
docker-compose -f docker-compose.china.yml logs -f app

# 检查健康状态
curl http://localhost:3000/api/health
```

### 2. 常见问题

**问题：镜像拉取超时**
```bash
# 解决方案：配置更多镜像源
sudo nano /etc/docker/daemon.json
# 添加更多registry-mirrors
```

**问题：npm 包下载慢**
```bash
# 解决方案：进入容器手动配置
docker exec -it goal-mate-app sh
npm config set registry https://registry.npmmirror.com/
```

**问题：数据库连接失败**
```bash
# 检查数据库配置
echo $DATABASE_URL
# 确保数据库服务运行中
```

### 3. 重新部署

```bash
# 完全清理重新部署
docker-compose -f docker-compose.china.yml down --volumes
docker system prune -af
./deploy-china.sh
```

## 📊 监控和维护

### 1. 查看资源使用

```bash
# 查看容器资源使用
docker stats goal-mate-app

# 查看磁盘使用
docker system df
```

### 2. 日志管理

```bash
# 查看实时日志
docker-compose -f docker-compose.china.yml logs -f

# 查看最近100行日志
docker-compose -f docker-compose.china.yml logs --tail=100
```

### 3. 备份和恢复

```bash
# 备份数据库
docker exec goal-mate-app npx prisma db pull

# 同步数据库结构并应用完整性约束
docker exec goal-mate-app npm run db:deploy
```

## 🌐 网络优化建议

1. **使用CDN**：为静态资源配置CDN加速
2. **反向代理**：使用Nginx进行反向代理和缓存
3. **压缩传输**：启用gzip压缩
4. **HTTP/2**：使用HTTP/2协议

## 📞 获取帮助

如果遇到问题：
1. 查看项目 Issues: [GitHub Issues](https://github.com/your-repo/issues)
2. 查看部署日志：`docker-compose -f docker-compose.china.yml logs`
3. 检查网络连接：`ping registry.npmmirror.com`

---

**预计部署时间：3-8分钟**（具体取决于网络状况）
