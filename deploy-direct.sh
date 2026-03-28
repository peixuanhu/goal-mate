#!/bin/bash

echo "=== Goal Mate 直接部署脚本 ==="

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    echo "请使用root用户运行此脚本"
    exit 1
fi

# 进入项目目录
cd /root/goal-mate

# 更新系统包
echo "1. 更新系统包..."
apt update

# 安装Node.js 18
echo "2. 安装Node.js 18..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

# 安装其他依赖
echo "3. 安装系统依赖..."
apt-get install -y python3 python3-pip build-essential wget curl

# 验证Node.js安装
echo "4. 验证Node.js版本..."
node --version
npm --version

# 配置npm镜像源
echo "5. 配置npm中国镜像源..."
npm config set registry https://registry.npmmirror.com/
npm config set disturl https://npmmirror.com/dist
npm config set sass_binary_site https://npmmirror.com/mirrors/node-sass
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm config set puppeteer_download_host https://npmmirror.com/mirrors
npm config set fetch-retries 5
npm config set fetch-retry-factor 10
npm config set fetch-retry-mintimeout 60000
npm config set fetch-retry-maxtimeout 120000

# 清理npm缓存
echo "6. 清理npm缓存..."
npm cache clean --force

# 安装项目依赖
echo "7. 安装项目依赖..."
if [ -f "package-lock.json" ]; then
    npm ci --production=false --verbose || npm install --verbose
else
    npm install --verbose
fi

# 生成Prisma客户端
echo "8. 生成Prisma客户端..."
npx prisma generate

# 构建项目
echo "9. 构建Next.js项目..."
npm run build

# 初始化数据库
echo "10. 初始化数据库..."
npx prisma db push

# 创建环境变量文件（如果不存在）
if [ ! -f ".env" ]; then
    echo "11. 创建环境变量文件..."
    cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL="file:./dev.db"
# 请在这里设置您的API密钥
# OPENAI_API_KEY=your_openai_api_key_here
# OPENAI_BASE_URL=https://api.openai.com/v1
EOF
    echo "请编辑 .env 文件设置您的API密钥"
fi

# 创建systemd服务文件
echo "12. 创建systemd服务..."
cat > /etc/systemd/system/goal-mate.service << 'EOF'
[Unit]
Description=Goal Mate Application
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/goal-mate
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 重新加载systemd配置
systemctl daemon-reload

# 启用并启动服务
echo "13. 启动Goal Mate服务..."
systemctl enable goal-mate
systemctl start goal-mate

# 等待几秒钟让服务启动
sleep 5

# 检查服务状态
echo "14. 检查服务状态..."
systemctl status goal-mate --no-pager

# 显示日志
echo "15. 显示最近日志..."
journalctl -u goal-mate --no-pager -n 20

echo ""
echo "=== 部署完成 ==="
echo "应用正在端口3000上运行"
echo "访问地址: http://your-server-ip:3000"
echo ""
echo "管理命令:"
echo "查看日志: journalctl -u goal-mate -f"
echo "重启服务: systemctl restart goal-mate"
echo "停止服务: systemctl stop goal-mate"
echo "检查状态: systemctl status goal-mate"
echo ""
echo "注意: 请编辑 /root/goal-mate/.env 文件设置您的API密钥" 