"use client"

import { DndContext, type DragEndEvent } from "@dnd-kit/core"
import { Bot, ChevronLeft, ChevronRight, ListTree, X } from "lucide-react"
import React, { useEffect, useState, type ReactNode } from "react"

import { AiWorkspace } from "./today/ai-workspace"
import { GlobalHeader } from "./workspace/global-header"
import { WorkspaceSidebarController } from "./workspace/workspace-sidebar-controller"

interface MainLayoutProps {
  children: ReactNode
  workspaceDate?: string | null
  onWorkspaceDragEnd?: (event: DragEndEvent) => void
}

export function MainLayout({ children, workspaceDate, onWorkspaceDragEnd }: MainLayoutProps) {
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [mobilePanel, setMobilePanel] = useState<"workspace" | "ai" | null>(null)

  useEffect(() => {
    if (mobilePanel === null) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobilePanel(null)
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [mobilePanel])

  return (
    <div className="flex min-h-dvh flex-col bg-[#f5f5f4] text-gray-900">
      <GlobalHeader />
      <DndContext onDragEnd={onWorkspaceDragEnd ?? (() => undefined)}>
        <div className="relative flex min-h-0 flex-1 lg:h-[calc(100dvh-4rem)] lg:overflow-hidden">
          <aside
            aria-label="目标工作台"
            className={`relative hidden shrink-0 border-r border-gray-200 bg-white transition-[width,opacity] duration-200 lg:block ${leftOpen ? "w-[300px] opacity-100 xl:w-[320px]" : "w-0 overflow-hidden opacity-0"}`}
          >
            <div className="h-full min-h-0 p-2">
              <WorkspaceSidebarController date={workspaceDate} />
            </div>
            <button
              aria-label="收起目标工作台"
              className="absolute right-2 top-2 z-20 rounded-lg bg-white/90 p-1.5 text-gray-400 shadow-sm hover:bg-gray-100 hover:text-gray-700"
              onClick={() => setLeftOpen(false)}
              type="button"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
          </aside>

          <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="pointer-events-none sticky top-3 z-20 hidden h-0 items-start justify-between px-3 lg:flex">
              <button
                aria-label="展开目标工作台"
                className={`pointer-events-auto rounded-lg border border-gray-200 bg-white/90 p-2 text-gray-500 shadow-sm backdrop-blur hover:bg-white ${leftOpen ? "invisible" : "visible"}`}
                onClick={() => setLeftOpen(true)}
                type="button"
              >
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                aria-label="展开 AI 助手"
                className={`pointer-events-auto rounded-lg border border-gray-200 bg-white/90 p-2 text-gray-500 shadow-sm backdrop-blur hover:bg-white ${rightOpen ? "invisible" : "visible"}`}
                onClick={() => setRightOpen(true)}
                type="button"
              >
                <Bot aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            {children}
          </main>

          <aside
            aria-label="AI 助手"
            className={`relative hidden shrink-0 border-l border-gray-200 bg-white transition-[width,opacity] duration-200 lg:block ${rightOpen ? "w-[340px] opacity-100 xl:w-[380px]" : "w-0 overflow-hidden opacity-0"}`}
          >
            <div className="h-full min-h-0 p-2"><AiWorkspace /></div>
            <button
              aria-label="收起 AI 助手"
              className="absolute left-2 top-2 z-20 rounded-lg bg-white/90 p-1.5 text-gray-400 shadow-sm hover:bg-gray-100 hover:text-gray-700"
              onClick={() => setRightOpen(false)}
              type="button"
            >
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </aside>
        </div>
      </DndContext>

      <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 gap-2 rounded-2xl border border-gray-200 bg-white/95 p-2 shadow-lg backdrop-blur lg:hidden">
        <button
          aria-label="打开目标工作台"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          onClick={() => setMobilePanel("workspace")}
          type="button"
        >
          <ListTree aria-hidden="true" className="h-4 w-4" />
          工作台
        </button>
        <button
          aria-label="打开 AI 助手"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          onClick={() => setMobilePanel("ai")}
          type="button"
        >
          <Bot aria-hidden="true" className="h-4 w-4" />
          AI
        </button>
      </div>

      {mobilePanel ? (
        <div className="fixed inset-0 z-50 bg-gray-950/35 lg:hidden" onMouseDown={event => {
          if (event.currentTarget === event.target) setMobilePanel(null)
        }}>
          <section
            aria-label={mobilePanel === "workspace" ? "目标工作台" : "AI 助手"}
            aria-modal="true"
            className="absolute inset-y-0 left-0 flex w-[92vw] max-w-[380px] flex-col bg-[#f5f5f4] p-2 shadow-2xl"
            role="dialog"
          >
            <button
              aria-label={mobilePanel === "workspace" ? "关闭目标工作台" : "关闭 AI 助手"}
              className="absolute right-4 top-4 z-30 rounded-lg bg-white p-1.5 text-gray-500 shadow-sm"
              onClick={() => setMobilePanel(null)}
              type="button"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
            <div className="min-h-0 flex-1">
              {mobilePanel === "workspace" ? <WorkspaceSidebarController date={workspaceDate} /> : <AiWorkspace />}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
