#!/bin/bash

# Goal Mate 中国服务器优化部署脚本
# 用法: ./deploy-china.sh

set -e

echo "🇨🇳 开始中国服务器优化部署..."

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    exit 1
fi

# 检查docker-compose是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
fi

# 设置环境变量
if [ ! -f .env ]; then
    echo "📝 创建 .env 文件..."
    cat > .env << EOF
# 数据库配置 (请根据实际情况修改)
DATABASE_URL="postgresql://username:password@localhost:5432/goalmate?schema=public"

# OpenAI API 配置 (请填入您的API信息)
OPENAI_API_KEY="your_api_key_here"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"

# 应用配置
NODE_ENV=production
PORT=3000
EOF
    echo "⚠️  请编辑 .env 文件，填入正确的配置信息"
    echo "然后重新运行此脚本"
    exit 1
fi

# 检查 .env 文件是否包含必要配置
if grep -q "your_api_key_here" .env; then
    echo "⚠️  请先编辑 .env 文件，填入正确的 API 配置"
    exit 1
fi

echo "🔧 配置 Docker 镜像源..."
# 配置Docker镜像源（如果还未配置）
if [ ! -f /etc/docker/daemon.json ] || ! grep -q "registry-mirrors" /etc/docker/daemon.json 2>/dev/null; then
    echo "正在配置 Docker 镜像源..."
    sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ],
  "insecure-registries": [],
  "debug": false,
  "experimental": false
}
EOF
    echo "重启 Docker 服务..."
    sudo systemctl restart docker
    sleep 5
fi

echo "🧹 清理旧容器和镜像..."
docker-compose -f docker-compose.china.yml down --remove-orphans || true
docker system prune -f || true

echo "🏗️  开始构建镜像 (使用中国镜像源)..."
# 设置构建时的网络优化
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# 预拉取基础镜像
echo "📥 预拉取基础镜像..."
docker pull node:18-alpine || echo "基础镜像拉取失败，将在构建时重试"

echo "🔨 构建应用镜像..."
docker-compose -f docker-compose.china.yml build --no-cache

echo "🚀 启动服务..."
docker-compose -f docker-compose.china.yml up -d

echo "⏳ 等待服务启动..."
sleep 30

# 检查服务状态
echo "🔍 检查服务状态..."
docker-compose -f docker-compose.china.yml ps

# 检查应用是否启动成功
echo "🏥 检查应用健康状态..."
for i in {1..12}; do
    if curl -f http://localhost:3000/api/health >/dev/null 2>&1; then
        echo "✅ 应用启动成功！"
        echo ""
        echo "🎉 部署完成！"
        echo "📱 应用访问地址: http://your-server-ip:3000"
        echo "📊 查看日志: docker-compose -f docker-compose.china.yml logs -f"
        echo "🛑 停止服务: docker-compose -f docker-compose.china.yml down"
        exit 0
    else
        echo "等待应用启动... ($i/12)"
        sleep 10
    fi
done

echo "⚠️  应用可能启动失败，请检查日志:"
echo "docker-compose -f docker-compose.china.yml logs" 