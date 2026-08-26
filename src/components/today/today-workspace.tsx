"use client"

import {
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { MainLayout } from "@/components/main-layout"
import { Button } from "@/components/ui/button"
import { addDays, normalizeLocalDateInput, parseDateOnly } from "@/lib/focus-period-utils"
import { getDefaultPlanningPreference } from "@/lib/today/planning-preference"
import type {
  PlanningPreferenceView,
  ScheduleBlockView,
  SchedulableCandidate,
  TodayView,
} from "@/lib/today/types"

import { DayTimeline, type TimelinePlacementPreview } from "./day-timeline"
import { ScheduleBlockEditor, type ScheduleEditorSubmit } from "./schedule-block-editor"
import { ScheduleCompletionSheet, type ScheduleCompletionPayload } from "./schedule-completion-sheet"
import {
  durationForCandidate,
  findNextFreeStart,
  findValidStartAtOrAfter,
  minuteFromTimelinePoint,
  placeTimelineRange,
  toLocalBlockRange,
  validateTimelinePlacement,
  type TimelinePlacementResult,
  type TimelineRange,
} from "./scheduling-ui"

type EditorIntent = {
  block: ScheduleBlockView | null
  candidate: SchedulableCandidate | null
  initialStartMinutes: number
  initialEndMinutes: number
  idempotencyKey: string | null
}

type SharedMutationContext = {
  token: number
  date: string
  generation: number
}

const EMPTY_BLOCKS: ScheduleBlockView[] = []
type TodayLoadResult = "applied" | "superseded" | "cancelled" | "failed"

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value)
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value)
}

function isCandidate(value: unknown): value is SchedulableCandidate {
  if (!isRecord(value)) return false

  return (value.kind === "plan" || value.kind === "action")
    && typeof value.id === "string"
    && typeof value.plan_id === "string"
    && isNullableString(value.action_id)
    && isNullableString(value.goal_id)
    && isNullableString(value.goal_name)
    && isNullableNonNegativeInteger(value.goal_position)
    && typeof value.name === "string"
    && isNullableString(value.due_date)
    && (value.estimated_minutes === null || typeof value.estimated_minutes === "number")
    && isPositiveInteger(value.effective_default_block_minutes)
    && value.effective_default_block_minutes % 15 === 0
    && isNonNegativeInteger(value.invested_minutes)
    && isNullableNonNegativeInteger(value.remaining_minutes)
    && isNonNegativeInteger(value.reserved_action_minutes)
    && isNullableNonNegativeInteger(value.available_minutes)
    && isNonNegativeInteger(value.scheduled_block_count)
    && isNonNegativeInteger(value.scheduled_minutes)
    && isNullablePositiveInteger(value.suggested_block_minutes)
    && (value.budget_status === "ok" || value.budget_status === "exhausted" || value.budget_status === "overrun")
    && typeof value.can_schedule === "boolean"
    && isNullableString(value.schedule_reason)
    && (value.energy_level === null || value.energy_level === "low" || value.energy_level === "medium" || value.energy_level === "high")
    && (value.effective_quadrant === null || value.effective_quadrant === "q1" || value.effective_quadrant === "q2" || value.effective_quadrant === "q3" || value.effective_quadrant === "q4")
    && typeof value.is_recurring === "boolean"
    && typeof value.version === "string"
}

function isCandidateDragData(value: unknown): value is { kind: "candidate"; candidate: SchedulableCandidate } {
  return isRecord(value) && value.kind === "candidate" && isCandidate(value.candidate)
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

type ScheduleBlockDragData = {
  kind: "schedule-block"
  block: ScheduleBlockView
  localRange: { start: number; end: number }
}

function isScheduleBlockDragData(value: unknown): value is ScheduleBlockDragData {
  return isRecord(value)
    && value.kind === "schedule-block"
    && isScheduleBlockView(value.block)
    && isRecord(value.localRange)
    && isNonNegativeInteger(value.localRange.start)
    && isPositiveInteger(value.localRange.end)
    && value.localRange.end > value.localRange.start
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

function clientYFromActivator(event: DragStartEvent): number | null {
  const activator = event.activatorEvent as Event & {
    clientY?: unknown
    touches?: { length: number; [index: number]: { clientY?: unknown } }
    changedTouches?: { length: number; [index: number]: { clientY?: unknown } }
  }
  const directY = typeof activator?.clientY === "number" ? activator.clientY : null
  const touch = activator?.touches?.[0] ?? activator?.changedTouches?.[0]
  const touchY = touch && typeof touch.clientY === "number" ? touch.clientY : null
  const originY = directY ?? touchY
  return originY
}

export function TodayWorkspace() {
  const [date, setDate] = useState<string | null>(null)
  const [view, setView] = useState<TodayView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editorIntent, setEditorIntent] = useState<EditorIntent | null>(null)
  const [completionBlock, setCompletionBlock] = useState<ScheduleBlockView | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [completionError, setCompletionError] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<TimelinePlacementPreview | null>(null)
  const [mutationLoading, setMutationLoading] = useState(false)
  const mountedRef = useRef(false)
  const viewGenerationRef = useRef(0)
  const latestLoadRequestIdRef = useRef(0)
  const activeRequestControllerRef = useRef<AbortController | null>(null)
  const dateRef = useRef<string | null>(null)
  const mutationLoadingRef = useRef(false)
  const sharedMutationTokenRef = useRef(0)
  const timelineDragActiveRef = useRef(false)
  const timelineGrabOffsetRef = useRef<number | null>(null)
  const timelineIdempotencyKeyRef = useRef<string | null>(null)
  const timelineMutationIdRef = useRef<string | null>(null)
  const defaultPreference = useMemo(() => getDefaultPlanningPreference(), [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      viewGenerationRef.current += 1
      sharedMutationTokenRef.current += 1
      timelineDragActiveRef.current = false
      timelineGrabOffsetRef.current = null
      timelineIdempotencyKeyRef.current = null
      timelineMutationIdRef.current = null
      activeRequestControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    setDate(normalizeLocalDateInput(new Date()))
  }, [])

  const loadToday = useCallback(async (
    requestedDate: string,
    controller: AbortController,
    preserveView: boolean,
  ): Promise<TodayLoadResult> => {
    const generation = viewGenerationRef.current
    const requestId = ++latestLoadRequestIdRef.current
    const inactiveResult = (): TodayLoadResult | null => {
      if (!mountedRef.current || viewGenerationRef.current !== generation || dateRef.current !== requestedDate) {
        return "cancelled"
      }
      return requestId === latestLoadRequestIdRef.current ? null : "superseded"
    }
    const initialInactive = inactiveResult()
    if (initialInactive !== null) return initialInactive
    const isCurrent = () => (
      mountedRef.current
      && viewGenerationRef.current === generation
      && dateRef.current === requestedDate
      && requestId === latestLoadRequestIdRef.current
    )
    activeRequestControllerRef.current = controller
    setLoading(true)
    setError(null)
    if (!preserveView) setView(null)

    try {
      const response = await fetch(`/api/today?date=${encodeURIComponent(requestedDate)}`, { signal: controller.signal })
      const payload: unknown = await response.json().catch(() => null)
      const inactive = inactiveResult()
      if (controller.signal.aborted) return inactive ?? "cancelled"
      if (inactive !== null) return inactive
      if (!response.ok) throw new Error(responseError(payload, `今日数据加载失败（${response.status}）`))
      if (!isTodayView(payload)) throw new Error("今日数据格式无效")
      if (payload.date !== requestedDate) throw new Error("返回数据日期与请求日期不一致")
      setView(payload)
      return "applied"
    } catch (loadError) {
      const inactive = inactiveResult()
      if (controller.signal.aborted) return inactive ?? "cancelled"
      if (inactive !== null) return inactive
      setError(loadError instanceof Error && loadError.message ? loadError.message : "今日数据加载失败")
      return "failed"
    } finally {
      if (isCurrent() && !controller.signal.aborted) {
        setLoading(false)
      }
      if (activeRequestControllerRef.current === controller) {
        activeRequestControllerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    viewGenerationRef.current += 1
    sharedMutationTokenRef.current += 1
    dateRef.current = date
    setEditorIntent(null)
    setCompletionBlock(null)
    setEditorError(null)
    setCompletionError(null)
    setScheduleError(null)
    mutationLoadingRef.current = false
    setMutationLoading(false)
    setDragPreview(null)
    timelineDragActiveRef.current = false
    timelineGrabOffsetRef.current = null
    timelineIdempotencyKeyRef.current = null
    timelineMutationIdRef.current = null
    if (date === null) return

    const controller = new AbortController()
    void loadToday(date, controller, false)

    return () => {
      controller.abort()
      activeRequestControllerRef.current?.abort()
    }
  }, [date, loadToday])

  useEffect(() => {
    const refreshAfterSharedMutation = (event: Event) => {
      const detail = (event as CustomEvent<{ entity?: string }>).detail
      const selectedDate = dateRef.current
      if (
        detail?.entity !== "schedule-block"
        || selectedDate === null
        || mutationLoadingRef.current
        || timelineMutationIdRef.current !== null
      ) return

      activeRequestControllerRef.current?.abort()
      const controller = new AbortController()
      void loadToday(selectedDate, controller, true)
    }

    window.addEventListener("goal-mate:data-changed", refreshAfterSharedMutation)
    return () => window.removeEventListener("goal-mate:data-changed", refreshAfterSharedMutation)
  }, [loadToday])

  const visibleView = date !== null && view?.date === date ? view : null
  const preference = visibleView?.preference ?? defaultPreference
  const candidates = visibleView?.candidates ?? []
  const focus = visibleView?.focus ?? null
  const blocks = visibleView?.blocks ?? EMPTY_BLOCKS

  const openCandidateAt = useCallback((candidate: SchedulableCandidate, startMinutes: number) => {
    if (date === null) return
    if (!candidate.can_schedule || candidate.suggested_block_minutes === null) {
      setScheduleError(candidate.schedule_reason ?? "当前事项暂不可安排")
      return
    }
    const duration = durationForCandidate(candidate.suggested_block_minutes, preference)
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
    if (!candidate.can_schedule || candidate.suggested_block_minutes === null) {
      setScheduleError(candidate.schedule_reason ?? "当前事项暂不可安排")
      return
    }
    const duration = durationForCandidate(candidate.suggested_block_minutes, preference)
    const start = findNextFreeStart(date, duration, preference, blocks)
    if (start === null) {
      setScheduleError("当天规划范围内没有足够的无冲突时间")
      return
    }
    openCandidateAt(candidate, start)
  }, [blocks, date, openCandidateAt, preference])

  function clearTimelineDrag() {
    setDragPreview(null)
    timelineDragActiveRef.current = false
    timelineGrabOffsetRef.current = null
    timelineIdempotencyKeyRef.current = null
  }

  function placementForDrag(event: DragMoveEvent | DragEndEvent, candidate: SchedulableCandidate): {
    preview: TimelinePlacementPreview
    result: TimelinePlacementResult
  } | null {
    if (date === null || event.over?.id !== "today-timeline") return null
    const duration = durationForCandidate(candidate.suggested_block_minutes, preference)
    const translated = event.active.rect.current.translated
    const clientY = translated
      ? translated.top + (timelineGrabOffsetRef.current ?? translated.height / 2)
      : event.over.rect.top + event.over.rect.height / 2
    const start = minuteFromTimelinePoint(clientY, event.over.rect, preference, duration)
    const range = placeTimelineRange("create", start, { start, end: start + duration }, preference)
    const result = validateTimelinePlacement({
      date,
      range,
      preference,
      blocks,
      ...(typeof candidate.available_minutes === "number" ? { maximumDurationMinutes: candidate.available_minutes } : {}),
    })
    return {
      result,
      preview: {
        id: candidate.id,
        title: candidate.name,
        range: result.ok ? result.range : range,
        valid: result.ok,
        message: result.ok ? null : result.message,
        pending: false,
      },
    }
  }

  function placementForBlockDrag(
    event: DragMoveEvent | DragEndEvent,
    data: ScheduleBlockDragData,
  ): { preview: TimelinePlacementPreview; result: TimelinePlacementResult } | null {
    if (date === null || event.over?.id !== "today-timeline") return null
    const duration = data.localRange.end - data.localRange.start
    const translated = event.active.rect.current.translated
    const initial = event.active.rect.current.initial
    const translatedTop = translated?.top ?? (initial ? initial.top + event.delta.y : null)
    if (translatedTop === null) return null
    const start = minuteFromTimelinePoint(translatedTop, event.over.rect, preference, duration)
    const range = placeTimelineRange("move", start, data.localRange, preference)
    const maximumDurationMinutes = maximumDurationForBlock(data.block, data.localRange)
    const result = validateTimelinePlacement({
      date,
      range,
      preference,
      blocks,
      ignoredBlockId: data.block.block_id,
      ...(typeof maximumDurationMinutes === "number"
        ? { maximumDurationMinutes }
        : {}),
    })
    return {
      result,
      preview: {
        id: `move:${data.block.block_id}`,
        title: data.block.title,
        range: result.ok ? result.range : range,
        valid: result.ok,
        message: result.ok ? null : result.message,
        pending: false,
      },
    }
  }

  function maximumDurationForBlock(block: ScheduleBlockView, original: TimelineRange): number | null | undefined {
    const candidate = candidates.find(item => (
      item.plan_id === block.plan_id && item.action_id === block.action_id
    ))
    if (candidate === undefined || candidate.available_minutes === undefined) return undefined
    if (candidate.available_minutes === null) return null
    return original.end - original.start + candidate.available_minutes
  }

  function updateTimelineBlock(
    block: ScheduleBlockView,
    result: Extract<TimelinePlacementResult, { ok: true }>,
    pendingPreview: TimelinePlacementPreview,
  ) {
    if (timelineMutationIdRef.current !== null) return
    const selectedDate = date
    if (selectedDate === null) return
    const mutationId = crypto.randomUUID()
    timelineMutationIdRef.current = mutationId
    setScheduleError(null)
    setDragPreview({ ...pendingPreview, pending: true })

    void (async () => {
      const isCurrentTimelineMutation = () => (
        mountedRef.current
        && timelineMutationIdRef.current === mutationId
        && dateRef.current === selectedDate
      )
      try {
        const response = await fetch("/api/schedule-block", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "update",
            block_id: block.block_id,
            expected_version: block.version,
            start_at: result.interval.start_at,
            end_at: result.interval.end_at,
          }),
        })
        const payload: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          const message = responseError(payload, `更新时间块失败（${response.status}）`)
          if (response.status === 409 && isCurrentTimelineMutation()) {
            await loadToday(selectedDate, new AbortController(), true)
            if (isCurrentTimelineMutation()) setScheduleError(message)
            return
          }
          throw new Error(message)
        }
        if (!isCurrentTimelineMutation()) return
        const refreshResult = await loadToday(selectedDate, new AbortController(), true)
        if (!isCurrentTimelineMutation()) return
        if (refreshResult === "failed") {
          setScheduleError("修改已保存，但今日数据刷新失败，请重新加载页面")
          return
        }
        if (refreshResult !== "applied") return
        window.dispatchEvent(new CustomEvent("goal-mate:data-changed", { detail: { entity: "schedule-block" } }))
      } catch (mutationError) {
        if (isCurrentTimelineMutation()) {
          setScheduleError(mutationError instanceof Error && mutationError.message ? mutationError.message : "更新时间块失败")
        }
      } finally {
        if (isCurrentTimelineMutation()) {
          timelineMutationIdRef.current = null
          clearTimelineDrag()
        }
      }
    })()
  }

  function handleResizeBlock(block: ScheduleBlockView, range: TimelineRange) {
    if (timelineMutationIdRef.current !== null || date === null) return
    const maximumDurationMinutes = maximumDurationForBlock(block, toLocalRangeForMaximum(block, range))
    const result = validateTimelinePlacement({
      date,
      range,
      preference,
      blocks,
      ignoredBlockId: block.block_id,
      ...(typeof maximumDurationMinutes === "number" ? { maximumDurationMinutes } : {}),
    })
    if (!result.ok) {
      setScheduleError(result.message)
      return
    }
    updateTimelineBlock(block, result, {
      id: `resize:${block.block_id}`,
      title: block.title,
      range: result.range,
      valid: true,
      message: null,
      pending: false,
    })
  }

  function toLocalRangeForMaximum(block: ScheduleBlockView, fallback: TimelineRange): TimelineRange {
    try {
      if (date !== null) return toLocalBlockRange(block.start_at, block.end_at, preference.timezone, date)
    } catch {
      // DayTimeline already validated the rendered block; retain its resized range as a safe fallback.
    }
    return fallback
  }

  function handleDragStart(event: DragStartEvent) {
    if (timelineMutationIdRef.current !== null) return
    const data = event.active.data.current
    if (isScheduleBlockDragData(data)) {
      if (data.block.status !== "scheduled") return
      timelineDragActiveRef.current = true
      timelineGrabOffsetRef.current = null
      timelineIdempotencyKeyRef.current = null
      setScheduleError(null)
      setDragPreview(null)
      return
    }
    if (!isCandidateDragData(data)) return
    const initial = event.active.rect.current.initial
    const activatorY = clientYFromActivator(event)
    timelineDragActiveRef.current = true
    timelineGrabOffsetRef.current = initial !== null && activatorY !== null
      ? activatorY - initial.top
      : null
    timelineIdempotencyKeyRef.current = crypto.randomUUID()
    setScheduleError(null)
    setDragPreview(null)
  }

  function handleDragMove(event: DragMoveEvent) {
    if (timelineMutationIdRef.current !== null || !timelineDragActiveRef.current) return
    const data = event.active.data.current
    if (isScheduleBlockDragData(data)) {
      if (event.over?.id !== "today-timeline") {
        setDragPreview(null)
        return
      }
      const placement = placementForBlockDrag(event, data)
      setDragPreview(placement?.preview ?? null)
      return
    }
    if (!isCandidateDragData(data)) return
    if (event.over?.id !== "today-timeline") {
      setDragPreview(null)
      return
    }
    const placement = placementForDrag(event, data.candidate)
    setDragPreview(placement?.preview ?? null)
  }

  function handleDragCancel(event: DragCancelEvent) {
    if (timelineMutationIdRef.current !== null || !timelineDragActiveRef.current) return
    const data = event.active.data.current
    if (!isScheduleBlockDragData(data) && !isCandidateDragData(data)) return
    clearTimelineDrag()
  }

  function handleDragEnd(event: DragEndEvent) {
    if (timelineMutationIdRef.current !== null || !timelineDragActiveRef.current) return
    const data = event.active.data.current
    if (isScheduleBlockDragData(data)) {
      const placement = placementForBlockDrag(event, data)
      if (placement === null) {
        clearTimelineDrag()
        return
      }
      if (!placement.result.ok) {
        setScheduleError(placement.result.message)
        clearTimelineDrag()
        return
      }
      if (
        placement.result.range.start === data.localRange.start
        && placement.result.range.end === data.localRange.end
      ) {
        clearTimelineDrag()
        return
      }

      updateTimelineBlock(data.block, placement.result, placement.preview)
      return
    }
    if (!isCandidateDragData(data)) return
    const candidate = data.candidate
    if (!candidate.can_schedule || candidate.suggested_block_minutes === null) {
      setScheduleError(candidate.schedule_reason ?? "当前事项暂不可安排")
      clearTimelineDrag()
      return
    }
    const placement = placementForDrag(event, candidate)
    if (placement === null) {
      clearTimelineDrag()
      return
    }
    if (!placement.result.ok) {
      setScheduleError(placement.result.message)
      clearTimelineDrag()
      return
    }
    const interval = placement.result.interval

    if (date === null) return
    const selectedDate = date
    const mutationId = timelineIdempotencyKeyRef.current ?? crypto.randomUUID()
    timelineIdempotencyKeyRef.current = mutationId
    timelineMutationIdRef.current = mutationId
    setScheduleError(null)
    setDragPreview({ ...placement.preview, pending: true })

    void (async () => {
      const isCurrentTimelineMutation = () => (
        mountedRef.current
        && timelineMutationIdRef.current === mutationId
        && dateRef.current === selectedDate
      )
      try {
        const response = await fetch("/api/schedule-block", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": mutationId },
          body: JSON.stringify({
            plan_id: candidate.plan_id,
            action_id: candidate.action_id,
            start_at: interval.start_at,
            end_at: interval.end_at,
            status: "scheduled",
            source: "manual",
          }),
        })
        await readMutationResponse(response, "创建时间块失败")
        if (!isCurrentTimelineMutation()) return
        const refreshResult = await loadToday(selectedDate, new AbortController(), true)
        if (!isCurrentTimelineMutation()) return
        if (refreshResult === "failed") {
          setScheduleError("修改已保存，但今日数据刷新失败，请重新加载页面")
          return
        }
        if (refreshResult !== "applied") return
        window.dispatchEvent(new CustomEvent("goal-mate:data-changed", { detail: { entity: "schedule-block" } }))
      } catch (mutationError) {
        if (isCurrentTimelineMutation()) {
          setScheduleError(mutationError instanceof Error && mutationError.message ? mutationError.message : "创建时间块失败")
        }
      } finally {
        if (isCurrentTimelineMutation()) {
          timelineMutationIdRef.current = null
          clearTimelineDrag()
        }
      }
    })()
  }

  function beginSharedMutation(): SharedMutationContext | null {
    const selectedDate = dateRef.current
    if (!mountedRef.current || selectedDate === null) return null
    const context = {
      token: ++sharedMutationTokenRef.current,
      date: selectedDate,
      generation: viewGenerationRef.current,
    }
    mutationLoadingRef.current = true
    setMutationLoading(true)
    return context
  }

  function isCurrentSharedMutation(context: SharedMutationContext): boolean {
    return mountedRef.current
      && sharedMutationTokenRef.current === context.token
      && viewGenerationRef.current === context.generation
      && dateRef.current === context.date
  }

  async function refetchAfterMutation(
    context: SharedMutationContext,
    close: () => void,
    scopedError: (message: string) => void,
  ) {
    if (!isCurrentSharedMutation(context)) return
    const refreshResult = await loadToday(context.date, new AbortController(), true)
    if (!isCurrentSharedMutation(context)) return
    if (refreshResult === "failed") {
      scopedError("修改已保存，但今日数据刷新失败，请重新加载页面")
      return
    }
    if (refreshResult === "applied") {
      window.dispatchEvent(new CustomEvent("goal-mate:data-changed", { detail: { entity: "schedule-block" } }))
      close()
      return
    }
    if (refreshResult === "superseded") close()
  }

  async function submitEditor(payload: ScheduleEditorSubmit) {
    if (editorIntent === null || mutationLoading || mutationLoadingRef.current) return
    const mutation = beginSharedMutation()
    if (mutation === null) return
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
      if (!isCurrentSharedMutation(mutation)) return
      await refetchAfterMutation(mutation, () => setEditorIntent(null), setEditorError)
    } catch (mutationError) {
      if (isCurrentSharedMutation(mutation)) {
        setEditorError(mutationError instanceof Error && mutationError.message ? mutationError.message : "保存时间块失败")
      }
    } finally {
      if (isCurrentSharedMutation(mutation)) {
        mutationLoadingRef.current = false
        setMutationLoading(false)
      }
    }
  }

  async function cancelEditorBlock(payload: { block_id: string; expected_version: number }) {
    if (mutationLoading || mutationLoadingRef.current) return
    const mutation = beginSharedMutation()
    if (mutation === null) return
    setEditorError(null)
    try {
      const response = await fetch("/api/schedule-block", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "cancel", ...payload }),
      })
      await readMutationResponse(response, "取消时间块失败")
      if (!isCurrentSharedMutation(mutation)) return
      await refetchAfterMutation(mutation, () => setEditorIntent(null), setEditorError)
    } catch (mutationError) {
      if (isCurrentSharedMutation(mutation)) {
        setEditorError(mutationError instanceof Error && mutationError.message ? mutationError.message : "取消时间块失败")
      }
    } finally {
      if (isCurrentSharedMutation(mutation)) {
        mutationLoadingRef.current = false
        setMutationLoading(false)
      }
    }
  }

  async function submitCompletion(payload: ScheduleCompletionPayload) {
    if (mutationLoading || mutationLoadingRef.current) return
    const mutation = beginSharedMutation()
    if (mutation === null) return
    setCompletionError(null)
    try {
      const response = await fetch("/api/schedule-block/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      await readMutationResponse(response, "记录时间块结果失败")
      if (!isCurrentSharedMutation(mutation)) return
      await refetchAfterMutation(mutation, () => setCompletionBlock(null), setCompletionError)
    } catch (mutationError) {
      if (isCurrentSharedMutation(mutation)) {
        setCompletionError(mutationError instanceof Error && mutationError.message ? mutationError.message : "记录时间块结果失败")
      }
    } finally {
      if (isCurrentSharedMutation(mutation)) {
        mutationLoadingRef.current = false
        setMutationLoading(false)
      }
    }
  }

  return (
    <MainLayout
      onScheduleCandidate={scheduleCandidate}
      onWorkspaceDragCancel={handleDragCancel}
      onWorkspaceDragEnd={handleDragEnd}
      onWorkspaceDragMove={handleDragMove}
      onWorkspaceDragStart={handleDragStart}
      workspaceDate={date}
      workspaceSnapshot={{ candidates, error, focus, loading }}
    >
      <div className="h-full min-h-0 px-3 py-4 sm:px-5 sm:py-5">
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

        {scheduleError ? (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800" role="alert">
            {scheduleError}
          </div>
        ) : null}

        {date === null ? (
          <div className="grid min-h-[520px] place-items-center rounded-2xl border border-stone-200/80 bg-white text-sm text-stone-500 shadow-sm" role="status">
            正在准备本地日期…
          </div>
        ) : (
          <>
            <section className="min-h-0 lg:h-[calc(100dvh-10.5rem)]">
                <DayTimeline
                  blocks={blocks}
                  date={date}
                  error={error}
                  loading={loading}
                  maximumDurationForBlock={maximumDurationForBlock}
                  preview={dragPreview}
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
                  onPlacementError={setScheduleError}
                  onResizeBlock={handleResizeBlock}
                  preference={preference}
                />
            </section>

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
          </>
        )}
      </div>
    </MainLayout>
  )
}
