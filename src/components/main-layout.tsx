"use client";

import { ReactNode } from "react";
import { ChatWrapper } from "./chat-wrapper";
import UserMenu from "./UserMenu";
import { QuadrantLeftSidebar } from "./quadrant-left-sidebar";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background md:flex-row md:h-screen md:max-h-dvh md:overflow-hidden">
      {/* 左侧四象限侧边栏 */}
      <div className="hidden md:flex shrink-0">
        <QuadrantLeftSidebar />
      </div>

      {/* 主要内容区域：移动端优先占满宽度，避免与固定宽度侧栏并排时被挤没 */}
      <main className="w-full min-w-0 shrink-0 overflow-y-auto md:min-h-0 md:shrink md:flex-1">
        {children}
      </main>

      {/* AI 助手：大屏为右侧栏；小屏为底部固定高度面板，主内容在上方完整可见 */}
      <div className="z-10 flex w-full flex-col border-t border-border bg-background h-[min(44dvh,380px)] max-h-[50dvh] min-h-[260px] md:h-screen md:max-h-none md:min-h-0 md:w-[min(100%,480px)] md:shrink-0 md:border-l md:border-t-0 md:sticky md:top-0">
        {/* 头部 */}
        <div className="shrink-0 border-b bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:from-blue-950 dark:to-indigo-950 md:p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center space-x-2 md:space-x-3">
              <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-5 w-5 text-white" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" 
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-800 md:text-lg dark:text-gray-200">
                  Goal Mate AI助手
                </h2>
                <p className="truncate text-xs text-gray-600 md:text-sm dark:text-gray-400">
                  智能目标管理助手
                </p>
              </div>
            </div>
            
            {/* 用户菜单 */}
            <UserMenu />
          </div>
        </div>
        
        {/* 聊天区域 - 使用 flex-1 和 min-h-0 确保正确的高度计算 */}
        <div className="flex-1 min-h-0 relative bg-gray-50 dark:bg-gray-900">
          <ChatWrapper />
        </div>
      </div>
    </div>
  );
} 