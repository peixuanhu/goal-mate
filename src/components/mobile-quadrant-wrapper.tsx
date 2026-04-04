"use client";

import dynamic from 'next/dynamic';

// 动态导入四象限侧边栏组件，禁用 SSR 以避免 hydration 错误
const QuadrantLeftSidebar = dynamic(
  () => import('@/components/quadrant-left-sidebar').then(mod => ({ default: mod.QuadrantLeftSidebar })),
  { ssr: false }
);

export function MobileQuadrantWrapper() {
  return (
    <div className="w-full lg:hidden">
      <QuadrantLeftSidebar />
    </div>
  );
}
