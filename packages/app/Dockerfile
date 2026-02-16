# Build stage
FROM oven/bun:1.3.5 AS builder
WORKDIR /app

# 先复制 workspace 依赖
COPY packages/sdk-js ./packages/sdk-js
COPY packages/ui ./packages/ui
COPY packages/util ./packages/util
COPY packages/plugin ./packages/plugin
COPY packages/function ./packages/function

# 再安装依赖
COPY package.json bun.lockb* ./
RUN bun install --ignore-scripts

# 复制源码并构建
COPY . .
RUN cd packages/app && bunx vite build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY packages/app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
