# 使用官方 Node.js 18 Alpine 镜像作为基础镜像
FROM node:18-alpine AS base

# 安装依赖阶段
FROM base AS deps
# 检查 https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine
# 如果需要，可以安装 libc6-compat
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 复制包管理文件
COPY package.json package-lock.json* ./
# 安装生产依赖
RUN npm ci --only=production

# 构建阶段
FROM base AS builder
WORKDIR /app
# 复制包管理文件并安装所有依赖（包括devDependencies）
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# 生成 Prisma 客户端
RUN npx prisma generate

# 构建应用
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# 生产镜像，复制所有文件并运行应用
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# 创建非root用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制构建后的应用
COPY --from=builder /app/public ./public

# 自动利用输出跟踪来减少镜像大小
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 复制 Prisma 相关文件
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# 启动应用
CMD ["node", "server.js"] 