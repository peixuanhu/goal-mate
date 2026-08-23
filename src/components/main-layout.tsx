"use client"

import { Bot, MessageCircle, PanelLeft, X } from "lucide-react"
import React, { type ReactNode, useEffect, useState } from "react"

import { AppHeader } from "./app-header"
import { QuadrantLeftSidebar } from "./quadrant-left-sidebar"
import { AiWorkspace } from "./today/ai-workspace"

interface MainLayoutProps {
  children: ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true)
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true)

  useEffect(() => {
    if (!isMobileChatOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileChatOpen(false)
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [isMobileChatOpen])

  return (
    <div className="flex min-h-dvh flex-col bg-stone-50 text-stone-900 lg:h-dvh lg:overflow-hidden">
      <AppHeader />

      <div className="flex min-h-0 flex-1">
        <div className="hidden shrink-0 border-r border-stone-200/80 bg-white lg:flex">
          <QuadrantLeftSidebar
            isOpen={isLeftSidebarOpen}
            onToggle={() => setIsLeftSidebarOpen(current => !current)}
          />
        </div>

        <main className="relative min-w-0 flex-1 overflow-y-auto">
          <button
            aria-label="展开四象限"
            className={`absolute left-4 top-4 z-20 hidden rounded-xl border border-stone-200 bg-white p-2.5 text-stone-500 shadow-sm transition hover:bg-stone-50 hover:text-stone-900 lg:block ${isLeftSidebarOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
            onClick={() => setIsLeftSidebarOpen(true)}
            title="展开四象限"
            type="button"
          >
            <PanelLeft aria-hidden="true" className="h-5 w-5" />
          </button>
          <button
            aria-label="展开 AI 助手"
            className={`absolute right-4 top-4 z-20 hidden rounded-xl border border-stone-200 bg-white p-2.5 text-stone-500 shadow-sm transition hover:bg-stone-50 hover:text-stone-900 lg:block ${isRightPanelOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
            onClick={() => setIsRightPanelOpen(true)}
            title="展开 AI 助手"
            type="button"
          >
            <Bot aria-hidden="true" className="h-5 w-5" />
          </button>
          {children}
        </main>

        <aside
          aria-label="AI 助手面板"
          className={`relative z-10 hidden min-h-0 shrink-0 border-l border-stone-200/80 bg-white transition-[width,opacity] duration-300 lg:block ${isRightPanelOpen ? "w-[380px] xl:w-[420px]" : "w-0 overflow-hidden opacity-0"}`}
        >
          <button
            aria-label="收起 AI 助手"
            className="absolute right-3 top-3 z-20 rounded-lg p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
            onClick={() => setIsRightPanelOpen(false)}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
          <AiWorkspace className="min-h-0 rounded-none border-0 shadow-none" />
        </aside>
      </div>

      <button
        aria-label="打开 AI 助手"
        className="fixed bottom-5 right-5 z-40 flex h-13 w-13 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-900/15 transition hover:-translate-y-0.5 hover:bg-violet-700 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 lg:hidden"
        onClick={() => setIsMobileChatOpen(true)}
        type="button"
      >
        <MessageCircle aria-hidden="true" className="h-5 w-5" />
      </button>

      {isMobileChatOpen ? (
        <div aria-label="AI 助手" aria-modal="true" className="fixed inset-0 z-50 lg:hidden" role="dialog">
          <button
            aria-label="关闭 AI 助手"
            className="absolute inset-0 bg-stone-950/35 backdrop-blur-[1px]"
            onClick={() => setIsMobileChatOpen(false)}
            type="button"
          />
          <div className="absolute inset-y-0 right-0 flex w-[min(92vw,420px)] flex-col border-l border-stone-200 bg-white shadow-2xl">
            <button
              aria-label="关闭 AI 助手"
              className="absolute right-3 top-3 z-20 rounded-lg p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
              onClick={() => setIsMobileChatOpen(false)}
              type="button"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
            <AiWorkspace className="min-h-0 rounded-none border-0 shadow-none" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
