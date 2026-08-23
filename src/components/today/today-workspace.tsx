"use client"

import { Bot, CalendarDays, ChevronLeft, ChevronRight, ListTree } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import UserMenu from "@/components/UserMenu"
import { Button } from "@/components/ui/button"
import { addDays, normalizeLocalDateInput, parseDateOnly } from "@/lib/focus-period-utils"
import { getDefaultPlanningPreference } from "@/lib/today/planning-preference"
import type { PlanningPreferenceView, SchedulableCandidate, TodayView } from "@/lib/today/types"
import { cn } from "@/lib/utils"

import { AiWorkspace } from "./ai-workspace"
import { DayTimeline } from "./day-timeline"
import { GoalCandidatePanel } from "./goal-candidate-panel"

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isCandidate(value: unknown): value is SchedulableCandidate {
  if (!isRecord(value)) return false

  return (value.kind === "plan" || value.kind === "action")
    && typeof value.id === "string"
    && typeof value.plan_id === "string"
    && isNullableString(value.action_id)
    && isNullableString(value.goal_id)
    && isNullableString(value.goal_name)
    && typeof value.name === "string"
    && isNullableString(value.due_date)
    && (value.estimated_minutes === null || typeof value.estimated_minutes === "number")
    && (value.energy_level === null || value.energy_level === "low" || value.energy_level === "medium" || value.energy_level === "high")
    && (value.effective_quadrant === null || value.effective_quadrant === "q1" || value.effective_quadrant === "q2" || value.effective_quadrant === "q3" || value.effective_quadrant === "q4")
    && typeof value.is_recurring === "boolean"
    && typeof value.version === "string"
}

function isPreference(value: unknown): value is PlanningPreferenceView {
  if (!isRecord(value)) return false

  return value.preference_id === "default"
    && typeof value.timezone === "string"
    && typeof value.day_start_minutes === "number"
    && typeof value.day_end_minutes === "number"
    && (value.high_energy_start_minutes === null || typeof value.high_energy_start_minutes === "number")
    && (value.high_energy_end_minutes === null || typeof value.high_energy_end_minutes === "number")
    && typeof value.buffer_minutes === "number"
    && typeof value.default_block_minutes === "number"
    && typeof value.capacity_warning_minutes === "number"
    && isNullableString(value.version)
}

function isFocus(value: unknown): value is NonNullable<TodayView["focus"]> {
  if (!isRecord(value)) return false
  return typeof value.goal_id === "string"
    && typeof value.name === "string"
    && typeof value.tag === "string"
    && typeof value.color === "string"
    && typeof value.version === "string"
}

function isTodayView(value: unknown): value is TodayView {
  if (!isRecord(value)) return false

  return typeof value.date === "string"
    && isPreference(value.preference)
    && (value.focus === null || isFocus(value.focus))
    && Array.isArray(value.candidates)
    && value.candidates.every(isCandidate)
    && Array.isArray(value.blocks)
    && value.blocks.length === 0
    && Array.isArray(value.checks)
    && value.checks.length === 0
}

function responseError(payload: unknown, fallback: string): string {
  return isRecord(payload) && typeof payload.error === "string" && payload.error.trim()
    ? payload.error
    : fallback
}

function formatHeadingDate(date: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(parseDateOnly(date))
}

export function TodayWorkspace() {
  const todayKey = normalizeLocalDateInput(new Date())
  const [date, setDate] = useState(todayKey)
  const [view, setView] = useState<TodayView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCandidates, setShowCandidates] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const requestIdRef = useRef(0)
  const defaultPreference = useMemo(() => getDefaultPlanningPreference(), [])

  useEffect(() => {
    const requestId = ++requestIdRef.current
    const controller = new AbortController()

    setLoading(true)
    setError(null)
    setView(null)

    async function loadToday() {
      try {
        const response = await fetch(`/api/today?date=${encodeURIComponent(date)}`, {
          signal: controller.signal,
        })
        const payload: unknown = await response.json().catch(() => null)

        if (requestId !== requestIdRef.current) return
        if (!response.ok) {
          throw new Error(responseError(payload, `今日数据加载失败（${response.status}）`))
        }
        if (!isTodayView(payload)) {
          throw new Error("今日数据格式无效")
        }

        setView(payload)
      } catch (loadError) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return
        setError(loadError instanceof Error && loadError.message ? loadError.message : "今日数据加载失败")
      } finally {
        if (requestId === requestIdRef.current && !controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadToday()

    return () => controller.abort()
  }, [date])

  const preference = view?.preference ?? defaultPreference
  const candidates = view?.candidates ?? []
  const focus = view?.focus ?? null

  return (
    <main className="min-h-dvh bg-[#f5f5f4] text-gray-900">
      <header className="border-b border-gray-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1720px] items-center gap-5 px-4 sm:px-6">
          <Link aria-label="Goal Mate 今日首页" className="flex shrink-0 items-center gap-2" href="/">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gray-950 text-sm font-bold text-white">G</span>
            <span className="hidden font-semibold tracking-tight sm:inline">Goal Mate</span>
          </Link>

          <nav aria-label="主导航" className="hidden items-center gap-1 md:flex">
            <Link className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-900" href="/">今天</Link>
            <Link className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900" href="/goals">目标</Link>
            <Link className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900" href="/plans">计划</Link>
            <Link className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900" href="/progress">进展</Link>
            <Link className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900" href="/reports">回顾</Link>
          </nav>

          <div className="ml-auto">
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1720px] px-3 py-4 sm:px-5 sm:py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm sm:px-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">Today workspace</p>
            <h1 className="truncate text-lg font-semibold text-gray-900">{formatHeadingDate(date)}</h1>
          </div>

          <div className="flex items-center gap-1.5" aria-label="日期导航">
            <Button aria-label="前一天" onClick={() => setDate(current => addDays(current, -1))} size="icon" type="button" variant="outline">
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button onClick={() => setDate(normalizeLocalDateInput(new Date()))} type="button" variant="outline">
              <CalendarDays aria-hidden="true" />
              回到今天
            </Button>
            <Button aria-label="后一天" onClick={() => setDate(current => addDays(current, 1))} size="icon" type="button" variant="outline">
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 lg:hidden" aria-label="辅助面板开关">
          <Button
            aria-controls="today-candidates"
            aria-expanded={showCandidates}
            onClick={() => setShowCandidates(current => !current)}
            type="button"
            variant="outline"
          >
            <ListTree aria-hidden="true" />
            {showCandidates ? "隐藏候选任务" : "显示候选任务"}
          </Button>
          <Button
            aria-controls="today-ai"
            aria-expanded={showAi}
            onClick={() => setShowAi(current => !current)}
            type="button"
            variant="outline"
          >
            <Bot aria-hidden="true" />
            {showAi ? "隐藏 AI 工作区" : "显示 AI 工作区"}
          </Button>
        </div>

        <div className="grid min-h-0 gap-4 lg:h-[calc(100dvh-9.75rem)] lg:grid-cols-[300px_minmax(0,1fr)_340px] lg:grid-rows-1">
          <section
            className="order-1 min-h-0 lg:col-start-2 lg:row-start-1"
          >
            <DayTimeline date={date} error={error} loading={loading} preference={preference} />
          </section>

          <section
            className={cn("order-2 hidden min-h-0 lg:col-start-1 lg:row-start-1 lg:block", showCandidates && "max-lg:block")}
            id="today-candidates"
          >
            <GoalCandidatePanel candidates={candidates} error={error} focus={focus} loading={loading} />
          </section>

          <section
            className={cn("order-3 hidden min-h-0 lg:col-start-3 lg:row-start-1 lg:block", showAi && "max-lg:block")}
            id="today-ai"
          >
            <AiWorkspace />
          </section>
        </div>
      </div>
    </main>
  )
}
