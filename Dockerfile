# 如果构建过慢，可以使用这个更快的版本
# 使用方法: docker build -f Dockerfile.fast -t goal-mate .

FROM node:18-alpine

# 安装必要的系统依赖
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    wget \
    curl

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 复制 package files
COPY package*.json ./

# 优化 npm 配置以提高下载速度和稳定性
RUN npm config set registry https://registry.npmmirror.com/ && \
    npm config set disturl https://npmmirror.com/dist && \
    npm config set sass_binary_site https://npmmirror.com/mirrors/node-sass && \
    npm config set electron_mirror https://npmmirror.com/mirrors/electron/ && \
    npm config set puppeteer_download_host https://npmmirror.com/mirrors && \
    npm config set chromedriver_cdnurl https://npmmirror.com/mirrors/chromedriver && \
    npm config set operadriver_cdnurl https://npmmirror.com/mirrors/operadriver && \
    npm config set phantomjs_cdnurl https://npmmirror.com/mirrors/phantomjs && \
    npm config set selenium_cdnurl https://npmmirror.com/mirrors/selenium && \
    npm config set node_inspector_cdnurl https://npmmirror.com/mirrors/node-inspector && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-factor 10 && \
    npm config set fetch-retry-mintimeout 60000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm cache clean --force

# 安装依赖，使用更多重试机制
RUN npm ci --production=false --verbose || \
    (npm cache clean --force && npm ci --production=false --verbose) || \
    (rm -rf node_modules package-lock.json && npm install --production=false --verbose)

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