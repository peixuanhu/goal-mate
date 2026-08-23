"use client"

import { Bot, MessageCircle, ScanSearch } from "lucide-react"
import React, { useState } from "react"

import { ChatWrapper } from "@/components/chat-wrapper"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type AiWorkspaceTab = "check" | "chat"

interface AiWorkspaceProps {
  className?: string
}

export function AiWorkspace({ className }: AiWorkspaceProps = {}) {
  const [activeTab, setActiveTab] = useState<AiWorkspaceTab>("check")

  function changeTab(value: string) {
    if (value === "check" || value === "chat") {
      setActiveTab(value)
    }
  }

  return (
    <aside
      aria-labelledby="ai-workspace-heading"
      className={cn(
        "flex h-full min-h-[560px] flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]",
        className,
      )}
    >
      <div className="border-b border-stone-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-violet-600">
            <Bot aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-stone-400">Goal Mate AI</p>
            <h2 id="ai-workspace-heading" className="text-base font-semibold text-stone-950">今日助手</h2>
          </div>
        </div>
      </div>

      <Tabs
        className="relative min-h-0 flex-1 gap-0"
        onValueChange={changeTab}
        value={activeTab}
      >
        <div className="border-b border-stone-100 px-4 py-3">
          <TabsList aria-label="AI 工作模式" className="grid w-full grid-cols-2 rounded-xl bg-stone-100 p-1">
            <TabsTrigger value="check">
              <ScanSearch aria-hidden="true" />
              AI 检查
            </TabsTrigger>
            <TabsTrigger value="chat">
              <MessageCircle aria-hidden="true" />
              AI 聊天
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          aria-hidden={activeTab !== "check"}
          className={cn(
            "m-0 flex min-h-0 flex-1 items-center justify-center bg-stone-50/70 p-6",
            activeTab === "check" ? "visible relative" : "invisible absolute inset-0 pointer-events-none",
          )}
          forceMount
          hidden={activeTab !== "check"}
          inert={activeTab !== "check"}
          value="check"
        >
          <div className="max-w-xs rounded-2xl border border-violet-100 bg-white p-6 text-center shadow-[0_8px_30px_rgba(109,40,217,0.06)]">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <ScanSearch aria-hidden="true" className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-semibold text-stone-950">准备好检查今天的安排</h3>
            <p className="mt-2 text-sm leading-6 text-stone-500">今日检查将在排程阶段启用</p>
            <p className="mt-1 text-xs leading-5 text-stone-400">之后会根据目标优先级、精力与时间容量提出调整建议。</p>
          </div>
        </TabsContent>

        <TabsContent
          aria-hidden={activeTab !== "chat"}
          className={cn(
            "m-0 min-h-0 flex-1 overflow-hidden bg-stone-50",
            activeTab === "chat" ? "visible relative" : "invisible absolute inset-0 pointer-events-none",
          )}
          forceMount
          hidden={activeTab !== "chat"}
          inert={activeTab !== "chat"}
          value="chat"
        >
          <ChatWrapper />
        </TabsContent>
      </Tabs>
    </aside>
  )
}
