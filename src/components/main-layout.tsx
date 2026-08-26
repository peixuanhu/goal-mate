"use client"

import {
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { Bot, ChevronLeft, ChevronRight, ListTree, X } from "lucide-react"
import React, { type ReactNode, useEffect, useState } from "react"

import type { SchedulableCandidate, TodayView } from "@/lib/today/types"

import { AppHeader } from "./app-header"
import { AiWorkspace } from "./today/ai-workspace"
import { GoalCandidatePanel } from "./today/goal-candidate-panel"
import { WorkspaceSidebarController } from "./workspace/workspace-sidebar-controller"

interface WorkspaceSnapshot {
  candidates: SchedulableCandidate[]
  error: string | null
  focus: TodayView["focus"]
  loading: boolean
}

interface MainLayoutProps {
  children: ReactNode
  workspaceDate?: string | null
  workspaceSnapshot?: WorkspaceSnapshot
  onScheduleCandidate?: (candidate: SchedulableCandidate) => void
  onWorkspaceDragStart?: (event: DragStartEvent) => void
  onWorkspaceDragMove?: (event: DragMoveEvent) => void
  onWorkspaceDragCancel?: (event: DragCancelEvent) => void
  onWorkspaceDragEnd?: (event: DragEndEvent) => void
}

export function MainLayout({
  children,
  workspaceDate,
  workspaceSnapshot,
  onScheduleCandidate,
  onWorkspaceDragStart,
  onWorkspaceDragMove,
  onWorkspaceDragCancel,
  onWorkspaceDragEnd,
}: MainLayoutProps) {
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

  function renderWorkspace() {
    if (workspaceSnapshot) {
      return (
        <GoalCandidatePanel
          candidates={workspaceSnapshot.candidates}
          error={workspaceSnapshot.error}
          focus={workspaceSnapshot.focus}
          loading={workspaceSnapshot.loading}
          onSchedule={onScheduleCandidate ?? (() => undefined)}
        />
      )
    }
    return <WorkspaceSidebarController date={workspaceDate} />
  }

  return (
    <div className="flex min-h-dvh flex-col bg-stone-50 text-stone-900 lg:h-dvh lg:overflow-hidden">
      <AppHeader />

      <DndContext
        autoScroll={{ threshold: { x: 0, y: 0.08 }, acceleration: 8 }}
        onDragCancel={onWorkspaceDragCancel}
        onDragEnd={onWorkspaceDragEnd}
        onDragMove={onWorkspaceDragMove}
        onDragStart={onWorkspaceDragStart}
      >
        <div className="relative flex min-h-0 flex-1">
          <aside
            aria-label="目标工作台"
            className={`relative hidden shrink-0 border-r border-stone-200/80 bg-white transition-[width,opacity] duration-300 lg:block ${leftOpen ? "w-[380px] opacity-100 xl:w-[400px]" : "w-0 overflow-hidden opacity-0"}`}
          >
            <div className="h-full min-h-0 p-2">{renderWorkspace()}</div>
            <button
              aria-label="收起目标工作台"
              className="absolute right-3 top-3 z-20 rounded-lg p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
              onClick={() => setLeftOpen(false)}
              type="button"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
          </aside>

          <main className="relative min-w-0 flex-1 overflow-y-auto">
            <div className="pointer-events-none sticky top-4 z-20 hidden h-0 items-start justify-between px-4 lg:flex">
              <button
                aria-label="展开目标工作台"
                className={`pointer-events-auto rounded-xl border border-stone-200 bg-white p-2.5 text-stone-500 shadow-sm transition hover:bg-stone-50 hover:text-stone-900 ${leftOpen ? "invisible" : "visible"}`}
                onClick={() => setLeftOpen(true)}
                type="button"
              >
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </button>
              <button
                aria-label="展开 AI 助手"
                className={`pointer-events-auto rounded-xl border border-stone-200 bg-white p-2.5 text-stone-500 shadow-sm transition hover:bg-stone-50 hover:text-stone-900 ${rightOpen ? "invisible" : "visible"}`}
                onClick={() => setRightOpen(true)}
                type="button"
              >
                <Bot aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            {children}
          </main>

          <aside
            aria-label="AI 助手"
            className={`relative z-10 hidden min-h-0 shrink-0 border-l border-stone-200/80 bg-white transition-[width,opacity] duration-300 lg:block ${rightOpen ? "w-[360px] opacity-100 xl:w-[400px]" : "w-0 overflow-hidden opacity-0"}`}
          >
            <button
              aria-label="收起 AI 助手"
              className="absolute right-3 top-3 z-20 rounded-lg p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
              onClick={() => setRightOpen(false)}
              type="button"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
            <AiWorkspace className="min-h-0 rounded-none border-0 shadow-none" />
          </aside>
        </div>
      </DndContext>

      <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 gap-2 rounded-2xl border border-stone-200 bg-white/95 p-2 shadow-lg backdrop-blur lg:hidden">
        <button
          aria-label="打开目标工作台"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
          onClick={() => setMobilePanel("workspace")}
          type="button"
        >
          <ListTree aria-hidden="true" className="h-4 w-4" />
          工作台
        </button>
        <button
          aria-label="打开 AI 助手"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
          onClick={() => setMobilePanel("ai")}
          type="button"
        >
          <Bot aria-hidden="true" className="h-4 w-4" />
          AI
        </button>
      </div>

      {mobilePanel ? (
        <div
          className="fixed inset-0 z-50 bg-stone-950/35 backdrop-blur-[1px] lg:hidden"
          onMouseDown={event => {
            if (event.currentTarget === event.target) setMobilePanel(null)
          }}
        >
          <section
            aria-label={mobilePanel === "workspace" ? "目标工作台" : "AI 助手"}
            aria-modal="true"
            className={`absolute inset-y-0 flex w-[min(92vw,400px)] flex-col bg-stone-50 p-2 shadow-2xl ${mobilePanel === "workspace" ? "left-0 border-r" : "right-0 border-l"} border-stone-200`}
            role="dialog"
          >
            <button
              aria-label={mobilePanel === "workspace" ? "关闭目标工作台" : "关闭 AI 助手"}
              className="absolute right-4 top-4 z-30 rounded-lg bg-white p-2 text-stone-500 shadow-sm transition hover:bg-stone-100"
              onClick={() => setMobilePanel(null)}
              type="button"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
            <div className="min-h-0 flex-1">
              {mobilePanel === "workspace"
                ? renderWorkspace()
                : <AiWorkspace className="min-h-0 rounded-none border-0 shadow-none" />}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
