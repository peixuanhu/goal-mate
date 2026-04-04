"use client";

import { ReactNode, useState } from "react";
import { ChatWrapper } from "./chat-wrapper";
import UserMenu from "./UserMenu";
import { QuadrantLeftSidebar } from "./quadrant-left-sidebar";
import { MessageCircle, X } from "lucide-react";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background md:flex-row md:h-screen md:max-h-dvh md:overflow-hidden">
      {/* 左侧四象限侧边栏 - 桌面端显示 */}
      <div className="hidden md:flex shrink-0">
        <QuadrantLeftSidebar />
      </div>

      {/* 主要内容区域 */}
      <main className="w-full min-w-0 shrink-0 overflow-y-auto md:min-h-0 md:shrink md:flex-1">
        {children}
      </main>

      {/* AI 助手 - 桌面端：右侧栏 */}
      <div className="hidden md:flex z-10 w-full flex-col border-t border-border bg-background md:h-screen md:max-h-none md:min-h-0 md:w-[min(100%,480px)] md:shrink-0 md:border-l md:border-t-0 md:sticky md:top-0">
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
        
        {/* 聊天区域 */}
        <div className="flex-1 min-h-0 relative bg-gray-50 dark:bg-gray-900">
          <ChatWrapper />
        </div>
      </div>

      {/* 移动端 AI 助手悬浮按钮 */}
      <button
        onClick={() => setIsMobileChatOpen(true)}
        className="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center"
        aria-label="打开 AI 助手"
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      {/* 移动端 AI 助手抽屉 */}
      {isMobileChatOpen && (
        <>
          {/* 遮罩层 */}
          <div 
            className="md:hidden fixed inset-0 bg-black/50 z-50"
            onClick={() => setIsMobileChatOpen(false)}
          />
          {/* 抽屉 */}
          <div className="md:hidden fixed inset-y-0 right-0 w-[85%] max-w-[400px] bg-background z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* 头部 */}
            <div className="shrink-0 border-b bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:from-blue-950 dark:to-indigo-950">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center space-x-2">
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
                    <h2 className="truncate text-base font-semibold text-gray-800 dark:text-gray-200">
                      Goal Mate AI助手
                    </h2>
                    <p className="truncate text-xs text-gray-600 dark:text-gray-400">
                      智能目标管理助手
                    </p>
                  </div>
                </div>
                
                {/* 关闭按钮 */}
                <button
                  onClick={() => setIsMobileChatOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  aria-label="关闭"
                >
                  <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
            </div>
            
            {/* 聊天区域 */}
            <div className="flex-1 min-h-0 relative bg-gray-50 dark:bg-gray-900">
              <ChatWrapper />
            </div>
          </div>
        </>
      )}
    </div>
  );
} 