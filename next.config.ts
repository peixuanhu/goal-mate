import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 启用 standalone 输出模式，用于 Docker 部署
  output: 'standalone',
  
  // 自定义 webpack 配置
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // 在开发模式下抑制特定的控制台警告
      const originalWarn = console.warn;
      console.warn = (...args) => {
        if (
          typeof args[0] === 'string' && 
          (args[0].includes('hydration') || 
           args[0].includes('cannot be a descendant') ||
           args[0].includes('validateDOMNesting'))
        ) {
          return;
        }
        originalWarn.apply(console, args);
      };
    }
    return config;
  },
};

export default nextConfig;
