"use client";

import { ReactNode } from "react";
import { ChatWrapper } from "./chat-wrapper";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen flex bg-background">
      {/* 主要内容区域 */}
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
      
      {/* 右侧AI助手聊天区域 */}
      <div className="w-96 border-l bg-background flex flex-col h-screen sticky top-0 right-0 z-10 shrink-0">
        {/* 头部 */}
        <div className="p-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
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
            <div>
              <h2 className="font-semibold text-lg text-gray-800 dark:text-gray-200">
                Goal Mate AI助手
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                智能目标管理助手
              </p>
            </div>
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