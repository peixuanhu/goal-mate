"use client"

import { DndContext, type DragEndEvent } from "@dnd-kit/core"
import { Bot, CalendarDays, ChevronLeft, ChevronRight, ListTree } from "lucide-react"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import { addDays, normalizeLocalDateInput, parseDateOnly } from "@/lib/focus-period-utils"
import { getDefaultPlanningPreference } from "@/lib/today/planning-preference"
import type {
  PlanningPreferenceView,
  ScheduleBlockView,
  SchedulableCandidate,
  TodayView,
} from "@/lib/today/types"
import { cn } from "@/lib/utils"

import { AiWorkspace } from "./ai-workspace"
import { DayTimeline } from "./day-timeline"
import { GoalCandidatePanel } from "./goal-candidate-panel"
import { ScheduleBlockEditor, type ScheduleEditorSubmit } from "./schedule-block-editor"
import { ScheduleCompletionSheet, type ScheduleCompletionPayload } from "./schedule-completion-sheet"
import {
  durationForCandidate,
  findNextFreeStart,
  findValidStartAtOrAfter,
  minuteFromTimelinePoint,
} from "./scheduling-ui"

type EditorIntent = {
  block: ScheduleBlockView | null
  candidate: SchedulableCandidate | null
  initialStartMinutes: number
  initialEndMinutes: number
  idempotencyKey: string | null
}

const EMPTY_BLOCKS: ScheduleBlockView[] = []

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

const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_INSTANT_PATTERN.test(value)) return false

  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}

function isScheduleBlockView(value: unknown): value is ScheduleBlockView {
  if (!isRecord(value)) return false

  const structurallyValid = typeof value.block_id === "string"
    && typeof value.plan_id === "string"
    && isNullableString(value.action_id)
    && typeof value.title === "string"
    && isNullableString(value.goal_id)
    && isNullableString(value.goal_name)
    && (value.energy_level === null || value.energy_level === "low" || value.energy_level === "medium" || value.energy_level === "high")
    && isIsoInstant(value.start_at)
    && isIsoInstant(value.end_at)
    && (value.status === "scheduled" || value.status === "completed" || value.status === "partial" || value.status === "skipped" || value.status === "cancelled")
    && (value.source === "manual" || value.source === "ai_check" || value.source === "ai_chat")
    && isNullableString(value.result_note)
    && typeof value.version === "number"
    && Number.isInteger(value.version)
    && value.version >= 1
  return structurallyValid
    && new Date(value.start_at as string).getTime() < new Date(value.end_at as string).getTime()
}

function isTodayView(value: unknown): value is TodayView {
  if (!isRecord(value)) return false

  return typeof value.date === "string"
    && isPreference(value.preference)
    && (value.focus === null || isFocus(value.focus))
    && Array.isArray(value.candidates)
    && value.candidates.every(isCandidate)
    && Array.isArray(value.blocks)
    && value.blocks.every(isScheduleBlockView)
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

async function readMutationResponse(response: Response, fallback: string): Promise<unknown> {
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(responseError(payload, `${fallback}（${response.status}）`))
  }
  return payload
}

export function TodayWorkspace() {
  const [date, setDate] = useState<string | null>(null)
  const [view, setView] = useState<TodayView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCandidates, setShowCandidates] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [editorIntent, setEditorIntent] = useState<EditorIntent | null>(null)
  const [completionBlock, setCompletionBlock] = useState<ScheduleBlockView | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [completionError, setCompletionError] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [mutationLoading, setMutationLoading] = useState(false)
  const requestIdRef = useRef(0)
  const activeRequestControllerRef = useRef<AbortController | null>(null)
  const dateRef = useRef<string | null>(null)
  const defaultPreference = useMemo(() => getDefaultPlanningPreference(), [])

  useEffect(() => {
    setDate(normalizeLocalDateInput(new Date()))
  }, [])

  const loadToday = useCallback(async (
    requestedDate: string,
    controller: AbortController,
    preserveView: boolean,
  ): Promise<boolean> => {
    const requestId = ++requestIdRef.current
    activeRequestControllerRef.current = controller
    setLoading(true)
    setError(null)
    if (!preserveView) setView(null)

    try {
      const response = await fetch(`/api/today?date=${encodeURIComponent(requestedDate)}`, { signal: controller.signal })
      const payload: unknown = await response.json().catch(() => null)
      if (requestId !== requestIdRef.current || controller.signal.aborted) return false
      if (!response.ok) throw new Error(responseError(payload, `今日数据加载失败（${response.status}）`))
      if (!isTodayView(payload)) throw new Error("今日数据格式无效")
      if (payload.date !== requestedDate) throw new Error("返回数据日期与请求日期不一致")
      setView(payload)
      return true
    } catch (loadError) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return false
      setError(loadError instanceof Error && loadError.message ? loadError.message : "今日数据加载失败")
      return false
    } finally {
      if (requestId === requestIdRef.current && !controller.signal.aborted) {
        setLoading(false)
      }
      if (activeRequestControllerRef.current === controller) {
        activeRequestControllerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    dateRef.current = date
    setEditorIntent(null)
    setCompletionBlock(null)
    setEditorError(null)
    setCompletionError(null)
    setScheduleError(null)
    if (date === null) return

    const controller = new AbortController()
    void loadToday(date, controller, false)

    return () => {
      controller.abort()
      activeRequestControllerRef.current?.abort()
    }
  }, [date, loadToday])

  const visibleView = date !== null && view?.date === date ? view : null
  const preference = visibleView?.preference ?? defaultPreference
  const candidates = visibleView?.candidates ?? []
  const focus = visibleView?.focus ?? null
  const blocks = visibleView?.blocks ?? EMPTY_BLOCKS

  const openCandidateAt = useCallback((candidate: SchedulableCandidate, startMinutes: number) => {
    if (date === null) return
    const duration = durationForCandidate(candidate.estimated_minutes, preference)
    const validStart = findValidStartAtOrAfter(date, startMinutes, duration, preference)
    if (validStart === null) {
      setScheduleError("当天规划范围内没有足够的无冲突时间")
      return
    }
    setScheduleError(null)
    setEditorError(null)
    setEditorIntent({
      block: null,
      candidate,
      initialStartMinutes: validStart,
      initialEndMinutes: validStart + duration,
      idempotencyKey: crypto.randomUUID(),
    })
  }, [date, preference])

  const scheduleCandidate = useCallback((candidate: SchedulableCandidate) => {
    if (date === null) return
    const duration = durationForCandidate(candidate.estimated_minutes, preference)
    const start = findNextFreeStart(date, duration, preference, blocks)
    if (start === null) {
      setScheduleError("当天规划范围内没有足够的无冲突时间")
      return
    }
    openCandidateAt(candidate, start)
  }, [blocks, date, openCandidateAt, preference])

  function handleDragEnd(event: DragEndEvent) {
    if (event.over?.id !== "today-timeline" || date === null) return
    const candidate = event.active.data.current?.candidate
    if (!isCandidate(candidate)) return
    const translated = event.active.rect.current.translated
    const clientY = translated
      ? translated.top + translated.height / 2
      : event.over.rect.top + event.over.rect.height / 2
    const duration = durationForCandidate(candidate.estimated_minutes, preference)
    const start = minuteFromTimelinePoint(clientY, event.over.rect, preference, duration)
    openCandidateAt(candidate, start)
  }

  async function refetchAfterMutation(close: () => void, scopedError: (message: string) => void) {
    const selectedDate = dateRef.current
    if (selectedDate === null) {
      scopedError("日期已变化，请关闭后重试")
      return
    }
    const refreshed = await loadToday(selectedDate, new AbortController(), true)
    if (!refreshed || dateRef.current !== selectedDate) {
      scopedError("修改已保存，但今日数据刷新失败，请重新加载页面")
      return
    }
    window.dispatchEvent(new CustomEvent("goal-mate:data-changed", { detail: { entity: "schedule-block" } }))
    close()
  }

  async function submitEditor(payload: ScheduleEditorSubmit) {
    if (editorIntent === null || mutationLoading) return
    setMutationLoading(true)
    setEditorError(null)
    try {
      const isEdit = editorIntent.block !== null
      const response = await fetch("/api/schedule-block", {
        method: isEdit ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(!isEdit && editorIntent.idempotencyKey ? { "Idempotency-Key": editorIntent.idempotencyKey } : {}),
        },
        body: JSON.stringify(isEdit ? {
          operation: "update",
          block_id: editorIntent.block?.block_id,
          expected_version: payload.expected_version,
          start_at: payload.start_at,
          end_at: payload.end_at,
        } : {
          plan_id: editorIntent.candidate?.plan_id,
          action_id: editorIntent.candidate?.action_id,
          start_at: payload.start_at,
          end_at: payload.end_at,
          status: "scheduled",
          source: "manual",
        }),
      })
      await readMutationResponse(response, isEdit ? "更新时间块失败" : "创建时间块失败")
      await refetchAfterMutation(() => setEditorIntent(null), setEditorError)
    } catch (mutationError) {
      setEditorError(mutationError instanceof Error && mutationError.message ? mutationError.message : "保存时间块失败")
    } finally {
      setMutationLoading(false)
    }
  }

  async function cancelEditorBlock(payload: { block_id: string; expected_version: number }) {
    if (mutationLoading) return
    setMutationLoading(true)
    setEditorError(null)
    try {
      const response = await fetch("/api/schedule-block", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "cancel", ...payload }),
      })
      await readMutationResponse(response, "取消时间块失败")
      await refetchAfterMutation(() => setEditorIntent(null), setEditorError)
    } catch (mutationError) {
      setEditorError(mutationError instanceof Error && mutationError.message ? mutationError.message : "取消时间块失败")
    } finally {
      setMutationLoading(false)
    }
  }

  async function submitCompletion(payload: ScheduleCompletionPayload) {
    if (mutationLoading) return
    setMutationLoading(true)
    setCompletionError(null)
    try {
      const response = await fetch("/api/schedule-block/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      await readMutationResponse(response, "记录时间块结果失败")
      await refetchAfterMutation(() => setCompletionBlock(null), setCompletionError)
    } catch (mutationError) {
      setCompletionError(mutationError instanceof Error && mutationError.message ? mutationError.message : "记录时间块结果失败")
    } finally {
      setMutationLoading(false)
    }
  }

  return (
    <main className="min-h-dvh bg-stone-50 text-stone-900">
      <AppHeader />

      <div className="mx-auto max-w-[1720px] px-3 py-4 sm:px-5 sm:py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(28,25,23,0.04)] sm:px-5">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-stone-400">Today workspace</p>
            <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight text-stone-950">
              {date === null ? "正在准备本地日期…" : formatHeadingDate(date)}
            </h1>
          </div>

          <div className="flex items-center gap-1.5" aria-label="日期导航">
            <Button
              aria-label="前一天"
              disabled={date === null}
              onClick={() => setDate(current => current === null ? current : addDays(current, -1))}
              size="icon"
              type="button"
              variant="outline"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button disabled={date === null} onClick={() => setDate(normalizeLocalDateInput(new Date()))} type="button" variant="outline">
              <CalendarDays aria-hidden="true" />
              回到今天
            </Button>
            <Button
              aria-label="后一天"
              disabled={date === null}
              onClick={() => setDate(current => current === null ? current : addDays(current, 1))}
              size="icon"
              type="button"
              variant="outline"
            >
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

        {scheduleError ? (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800" role="alert">
            {scheduleError}
          </div>
        ) : null}

        {date === null ? (
          <div className="grid min-h-[620px] place-items-center rounded-2xl border border-stone-200/80 bg-white text-sm text-stone-500 shadow-sm" role="status">
            正在准备本地日期…
          </div>
        ) : (
          <DndContext onDragEnd={handleDragEnd}>
            <div className="grid min-h-0 gap-4 lg:h-[calc(100dvh-9.75rem)] lg:grid-cols-[300px_minmax(0,1fr)_340px] lg:grid-rows-1">
              <section className="order-1 min-h-0 lg:col-start-2 lg:row-start-1">
                <DayTimeline
                  blocks={blocks}
                  date={date}
                  error={error}
                  loading={loading}
                  onCompleteBlock={block => {
                    setScheduleError(null)
                    setCompletionError(null)
                    setCompletionBlock(block)
                  }}
                  onEditBlock={block => {
                    setScheduleError(null)
                    setEditorError(null)
                    setEditorIntent({
                      block,
                      candidate: null,
                      initialStartMinutes: preference.day_start_minutes,
                      initialEndMinutes: Math.min(preference.day_end_minutes, preference.day_start_minutes + preference.default_block_minutes),
                      idempotencyKey: null,
                    })
                  }}
                  preference={preference}
                />
              </section>

              <section className={cn("order-2 hidden min-h-0 lg:col-start-1 lg:row-start-1 lg:block", showCandidates && "max-lg:block")} id="today-candidates">
                <GoalCandidatePanel candidates={candidates} error={error} focus={focus} loading={loading} onSchedule={scheduleCandidate} />
              </section>

              <section className={cn("order-3 hidden min-h-0 lg:col-start-3 lg:row-start-1 lg:block", showAi && "max-lg:block")} id="today-ai">
                <AiWorkspace />
              </section>
            </div>

            {editorIntent ? (
              <ScheduleBlockEditor
                block={editorIntent.block}
                candidate={editorIntent.candidate}
                date={date}
                error={editorError}
                initialEndMinutes={editorIntent.initialEndMinutes}
                initialStartMinutes={editorIntent.initialStartMinutes}
                loading={mutationLoading}
                onCancelBlock={cancelEditorBlock}
                onClose={() => {
                  if (!mutationLoading) setEditorIntent(null)
                }}
                onIntentChange={() => {
                  setEditorError(null)
                  setEditorIntent(current => current?.block === null
                    ? { ...current, idempotencyKey: crypto.randomUUID() }
                    : current)
                }}
                onSubmit={submitEditor}
                planName={candidates.find(candidate => (
                  candidate.kind === "plan"
                  && candidate.plan_id === (editorIntent.candidate?.plan_id ?? editorIntent.block?.plan_id)
                ))?.name ?? null}
                preference={preference}
              />
            ) : null}

            {completionBlock ? (
              <ScheduleCompletionSheet
                block={completionBlock}
                error={completionError}
                isOrdinaryPlan={completionBlock.action_id === null && candidates.some(candidate => (
                  candidate.kind === "plan"
                  && candidate.plan_id === completionBlock.plan_id
                  && !candidate.is_recurring
                ))}
                loading={mutationLoading}
                onClose={() => {
                  if (!mutationLoading) setCompletionBlock(null)
                }}
                onSubmit={submitCompletion}
              />
            ) : null}
          </DndContext>
        )}
      </div>
    </main>
  )
}
