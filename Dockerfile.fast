# 如果构建过慢，可以使用这个更快的版本
# 使用方法: docker build -f Dockerfile.fast -t goal-mate .

FROM node:18-alpine

# 安装必要的系统依赖
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 复制 package files
COPY package*.json ./

# 设置 npm 配置以提高下载速度
RUN npm config set registry https://registry.npmmirror.com/ && \
    npm ci --production=false

# 复制源代码
COPY . .

# 生成 Prisma 客户端
RUN npx prisma generate

# 构建应用
RUN npm run build

# 创建非root用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 修改文件权限
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && node server.js"] 