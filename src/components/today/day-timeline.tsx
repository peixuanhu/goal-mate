"use client"

import { useDroppable } from "@dnd-kit/core"
import { Clock3 } from "lucide-react"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { formatUtcInTimeZone } from "@/lib/today/timezone"
import type { PlanningPreferenceView, ScheduleBlockStatus, ScheduleBlockView } from "@/lib/today/types"

import { InteractiveScheduleBlock, type ResizeEdge } from "./interactive-schedule-block"
import {
  buildTimelineGrid,
  minuteFromTimelinePoint,
  minuteToTimeInput,
  placeTimelineRange,
  toLocalBlockRange,
  validateTimelinePlacement,
  type TimelinePlacementResult,
  type TimelineRange,
} from "./scheduling-ui"

export type TimelinePlacementPreview = {
  id: string
  title: string
  range: TimelineRange
  valid: boolean
  message: string | null
  pending: boolean
}

interface DayTimelineProps {
  date: string
  preference: PlanningPreferenceView
  blocks: ScheduleBlockView[]
  loading: boolean
  error: string | null
  preview?: TimelinePlacementPreview | null
  onEditBlock: (block: ScheduleBlockView) => void
  onCompleteBlock: (block: ScheduleBlockView) => void
  onResizeBlock: (block: ScheduleBlockView, range: TimelineRange) => void
  onPlacementError: (message: string) => void
  maximumDurationForBlock: (block: ScheduleBlockView, original: TimelineRange) => number | null | undefined
}

type ResizePlacement = {
  preview: TimelinePlacementPreview
  result: TimelinePlacementResult
}

type ResizeState = {
  pointerId: number
  clientY: number
  block: ScheduleBlockView
  edge: ResizeEdge
  original: TimelineRange
  placement: ResizePlacement
}

export const TIMELINE_PIXELS_PER_MINUTE = 3.2

const STATUS_LABELS: Record<ScheduleBlockStatus, string> = {
  scheduled: "已安排",
  completed: "已完成",
  partial: "部分完成",
  skipped: "已跳过",
  cancelled: "已取消",
}

const STATUS_CLASSES: Record<ScheduleBlockStatus, string> = {
  scheduled: "border-violet-200 bg-violet-100/95 text-violet-950",
  completed: "border-emerald-200 bg-emerald-100/95 text-emerald-950",
  partial: "border-amber-200 bg-amber-100/95 text-amber-950",
  skipped: "border-gray-200 bg-gray-100/95 text-gray-600",
  cancelled: "border-gray-200 bg-white/85 text-gray-400 line-through",
}

function formatMinutes(totalMinutes: number): string {
  return minuteToTimeInput(totalMinutes)
}

function useCurrentLocalMinute(date: string, timezone: string): number | null {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const interval = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(interval)
  }, [date, timezone])

  if (now === null) return null
  try {
    const local = formatUtcInTimeZone(now, timezone)
    return local.date === date ? local.minutes : null
  } catch {
    return null
  }
}

export function DayTimeline({
  date,
  preference,
  blocks,
  loading,
  error,
  preview = null,
  onEditBlock,
  onCompleteBlock,
  onResizeBlock,
  onPlacementError,
  maximumDurationForBlock,
}: DayTimelineProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: "today-timeline",
    data: {
      dayStartMinutes: preference.day_start_minutes,
      dayEndMinutes: preference.day_end_minutes,
    },
  })
  const scrollViewportRef = useRef<HTMLDivElement>(null)
  const dropzoneRef = useRef<HTMLDivElement | null>(null)
  const resizeTargetRef = useRef<HTMLButtonElement | null>(null)
  const resizeStateRef = useRef<ResizeState | null>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const [resizeState, setResizeState] = useState<ResizeState | null>(null)
  const autoPositionedDateRef = useRef<string | null>(null)
  const markers = useMemo(
    () => buildTimelineGrid(preference),
    [preference],
  )
  const durationMinutes = preference.day_end_minutes - preference.day_start_minutes
  const timelineHeight = Math.max(520, Math.ceil(durationMinutes * TIMELINE_PIXELS_PER_MINUTE))
  const currentMinute = useCurrentLocalMinute(date, preference.timezone)
  const showCurrentTime = currentMinute !== null
    && currentMinute >= preference.day_start_minutes
    && currentMinute < preference.day_end_minutes

  const updateResizePlacement = useCallback((clientY: number): ResizeState | null => {
    const current = resizeStateRef.current
    const dropzone = dropzoneRef.current
    if (current === null || dropzone === null) return null
    const snappedMinute = minuteFromTimelinePoint(clientY, dropzone.getBoundingClientRect(), preference, 0)
    const range = placeTimelineRange(
      current.edge === "start" ? "resize-start" : "resize-end",
      snappedMinute,
      current.original,
      preference,
    )
    const maximum = maximumDurationForBlock(current.block, current.original)
    const result = validateTimelinePlacement({
      date,
      range,
      preference,
      blocks,
      ignoredBlockId: current.block.block_id,
      ...(typeof maximum === "number" ? { maximumDurationMinutes: maximum } : {}),
    })
    const next: ResizeState = {
      ...current,
      clientY,
      placement: {
        result,
        preview: {
          id: `resize:${current.block.block_id}`,
          title: current.block.title,
          range: result.ok ? result.range : range,
          valid: result.ok,
          message: result.ok ? null : result.message,
          pending: false,
        },
      },
    }
    resizeStateRef.current = next
    setResizeState(next)
    return next
  }, [blocks, date, maximumDurationForBlock, preference])

  const stopResizeAutoScroll = useCallback(() => {
    if (resizeFrameRef.current === null) return
    window.cancelAnimationFrame(resizeFrameRef.current)
    resizeFrameRef.current = null
  }, [])

  const startResizeAutoScroll = useCallback(() => {
    if (resizeFrameRef.current !== null) return
    const frame = () => {
      resizeFrameRef.current = null
      const current = resizeStateRef.current
      const viewport = scrollViewportRef.current
      if (current === null || viewport === null) return
      const rect = viewport.getBoundingClientRect()
      let delta = 0
      if (current.clientY <= rect.top + 48) delta = -12
      else if (current.clientY >= rect.bottom - 48) delta = 12
      if (delta !== 0) {
        const maximumScrollTop = Math.max(viewport.scrollHeight - viewport.clientHeight, 0)
        const nextScrollTop = Math.min(maximumScrollTop, Math.max(0, viewport.scrollTop + delta))
        if (nextScrollTop !== viewport.scrollTop) {
          viewport.scrollTop = nextScrollTop
          updateResizePlacement(current.clientY)
        }
      }
      if (resizeStateRef.current !== null && resizeFrameRef.current === null) {
        resizeFrameRef.current = window.requestAnimationFrame(frame)
      }
    }
    resizeFrameRef.current = window.requestAnimationFrame(frame)
  }, [updateResizePlacement])

  const disposeResize = useCallback(() => {
    stopResizeAutoScroll()
    const current = resizeStateRef.current
    const target = resizeTargetRef.current
    resizeStateRef.current = null
    resizeTargetRef.current = null
    if (current !== null && target?.hasPointerCapture?.(current.pointerId)) {
      target.releasePointerCapture(current.pointerId)
    }
  }, [stopResizeAutoScroll])

  const clearResize = useCallback(() => {
    disposeResize()
    setResizeState(null)
  }, [disposeResize])

  const handleResizePointerDown = useCallback((block: ScheduleBlockView, edge: ResizeEdge, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.isPrimary === false || event.button !== 0 || preview?.pending || resizeStateRef.current !== null) return
    let original: TimelineRange
    try {
      original = toLocalBlockRange(block.start_at, block.end_at, preference.timezone, date)
    } catch {
      onPlacementError("该时间块无法在当前日期调整")
      return
    }
    const pointerId = event.pointerId
    event.currentTarget.setPointerCapture(pointerId)
    const maximum = maximumDurationForBlock(block, original)
    const result = validateTimelinePlacement({
      date,
      range: original,
      preference,
      blocks,
      ignoredBlockId: block.block_id,
      ...(typeof maximum === "number" ? { maximumDurationMinutes: maximum } : {}),
    })
    const next: ResizeState = {
      pointerId,
      clientY: event.clientY,
      block,
      edge,
      original,
      placement: {
        result,
        preview: {
          id: `resize:${block.block_id}`,
          title: block.title,
          range: original,
          valid: result.ok,
          message: result.ok ? null : result.message,
          pending: false,
        },
      },
    }
    resizeTargetRef.current = event.currentTarget
    resizeStateRef.current = next
    setResizeState(next)
    startResizeAutoScroll()
  }, [blocks, date, maximumDurationForBlock, onPlacementError, preference, preview?.pending, startResizeAutoScroll])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const current = resizeStateRef.current
      if (current === null || event.pointerId !== current.pointerId) return
      event.preventDefault()
      updateResizePlacement(event.clientY)
    }
    const handlePointerUp = (event: PointerEvent) => {
      const current = resizeStateRef.current
      if (current === null || event.pointerId !== current.pointerId) return
      event.preventDefault()
      const final = updateResizePlacement(event.clientY) ?? current
      clearResize()
      if (
        final.placement.result.ok
        && final.placement.result.range.start === final.original.start
        && final.placement.result.range.end === final.original.end
      ) return
      if (final.placement.result.ok) onResizeBlock(final.block, final.placement.result.range)
      else onPlacementError(final.placement.result.message)
    }
    const handlePointerCancel = (event: PointerEvent) => {
      const current = resizeStateRef.current
      if (current !== null && event.pointerId === current.pointerId) clearResize()
    }
    const handleLostPointerCapture = (event: PointerEvent) => {
      const current = resizeStateRef.current
      if (current !== null && event.pointerId === current.pointerId) clearResize()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || resizeStateRef.current === null) return
      event.preventDefault()
      clearResize()
    }
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
    window.addEventListener("lostpointercapture", handleLostPointerCapture)
    window.addEventListener("keydown", handleKeyDown, true)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
      window.removeEventListener("lostpointercapture", handleLostPointerCapture)
      window.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [clearResize, onPlacementError, onResizeBlock, updateResizePlacement])

  useEffect(() => {
    clearResize()
  }, [clearResize, date])

  useEffect(() => disposeResize, [disposeResize])

  useEffect(() => {
    if (!showCurrentTime || currentMinute === null || durationMinutes <= 0) return
    if (autoPositionedDateRef.current === date) return

    const viewport = scrollViewportRef.current
    if (viewport === null) return

    const currentOffset = ((currentMinute - preference.day_start_minutes) / durationMinutes) * timelineHeight
    const maxScrollTop = Math.max(timelineHeight - viewport.clientHeight, 0)
    viewport.scrollTop = Math.min(
      Math.max(currentOffset - viewport.clientHeight / 2, 0),
      maxScrollTop,
    )
    autoPositionedDateRef.current = date
  }, [currentMinute, date, durationMinutes, preference.day_start_minutes, showCurrentTime, timelineHeight])

  return (
    <section aria-labelledby="today-timeline-heading" className="flex h-full min-h-[620px] flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
      <header className="flex min-h-14 items-center justify-between border-b border-stone-100 px-5 py-3">
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-stone-400">今日时间线</p>
          <h2 id="today-timeline-heading" className="mt-0.5 text-base font-semibold text-stone-950">{date}</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">
          <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
          {formatMinutes(preference.day_start_minutes)}–{formatMinutes(preference.day_end_minutes)}
        </span>
      </header>

      <div
        className="relative min-h-0 flex-1 overflow-y-auto bg-stone-50/50"
        data-testid="today-timeline-scroll"
        ref={scrollViewportRef}
      >
        <div
          className={`relative transition-colors ${isOver ? "bg-violet-50/70" : ""}`}
          data-testid="today-timeline-dropzone"
          ref={node => {
            dropzoneRef.current = node
            setNodeRef(node)
          }}
          style={{ minHeight: timelineHeight }}
        >
          {markers.map((marker, index) => {
            const { emphasis, minutes } = marker
            const top = durationMinutes === 0 ? 0 : ((minutes - preference.day_start_minutes) / durationMinutes) * 100
            const markerAlignment = index === 0
              ? "translate-y-0"
              : index === markers.length - 1
                ? "-translate-y-full"
                : "-translate-y-1/2"
            const showLabel = emphasis === "hour" || index === markers.length - 1
            const lineClassName = emphasis === "hour"
              ? "border-stone-300"
              : emphasis === "half"
                ? "border-stone-200"
                : "border-stone-200/60"
            return (
              <div className="absolute inset-x-0 flex items-start" data-emphasis={emphasis} data-testid="timeline-grid-line" key={minutes} style={{ top: `${top}%` }}>
                {showLabel ? <time className={`w-16 ${markerAlignment} pr-3 text-right text-xs tabular-nums text-stone-400`}>{formatMinutes(minutes)}</time> : <div className="w-16" />}
                <div className={`flex-1 border-t ${lineClassName}`} data-emphasis={emphasis} data-testid={`timeline-grid-${minutes}`} />
              </div>
            )
          })}

          {blocks.map(block => {
            let local
            try {
              local = toLocalBlockRange(block.start_at, block.end_at, preference.timezone, date)
            } catch {
              return null
            }
            const visibleStart = Math.max(local.start, preference.day_start_minutes)
            const visibleEnd = Math.min(local.end, preference.day_end_minutes)
            if (visibleEnd <= visibleStart || durationMinutes <= 0) return null
            const top = ((visibleStart - preference.day_start_minutes) / durationMinutes) * 100
            const height = ((visibleEnd - visibleStart) / durationMinutes) * 100
            return (
              <InteractiveScheduleBlock
                block={block}
                key={block.block_id}
                localRange={local}
                disabled={false}
                onComplete={onCompleteBlock}
                onEdit={onEditBlock}
                onResizePointerDown={handleResizePointerDown}
                statusClassName={STATUS_CLASSES[block.status]}
                statusLabel={STATUS_LABELS[block.status]}
                style={{ top: `${top}%`, height: `${height}%`, minHeight: 48 }}
                timelineInteractionDisabled={preview?.pending === true}
              />
            )
          })}

          {(resizeState?.placement.preview ?? preview) && durationMinutes > 0 ? (() => {
            const activePreview = resizeState?.placement.preview ?? preview
            if (activePreview === null) return null
            const visibleStart = Math.max(activePreview.range.start, preference.day_start_minutes)
            const visibleEnd = Math.min(activePreview.range.end, preference.day_end_minutes)
            if (visibleEnd <= visibleStart) return null
            const top = ((visibleStart - preference.day_start_minutes) / durationMinutes) * 100
            const height = ((visibleEnd - visibleStart) / durationMinutes) * 100
            const previewClass = activePreview.valid
              ? "border-violet-400 bg-violet-200/90 text-violet-950"
              : "border-red-400 bg-red-100/95 text-red-900"
            return (
              <div
                aria-busy={activePreview.pending}
                className={`pointer-events-none absolute left-[4.5rem] right-3 z-30 overflow-hidden rounded-xl border px-3 py-2 shadow-sm ${previewClass} ${activePreview.pending ? "opacity-75" : ""}`}
                data-testid="timeline-placement-preview"
                data-valid={String(activePreview.valid)}
                key={activePreview.id}
                style={{ top: `${top}%`, height: `${height}%`, minHeight: 48 }}
              >
                <p className="truncate text-sm font-semibold">{activePreview.title}</p>
                <p className="mt-0.5 text-[11px] tabular-nums opacity-80">{formatMinutes(activePreview.range.start)}–{formatMinutes(activePreview.range.end)} · {activePreview.range.end - activePreview.range.start} 分钟</p>
                {activePreview.message ? <p className="mt-0.5 text-[11px] font-medium">{activePreview.message}</p> : null}
              </div>
            )
          })() : null}

          {showCurrentTime && currentMinute !== null ? (
            <div aria-label={`当前时间 ${formatMinutes(currentMinute)}`} className="pointer-events-none absolute left-[4.5rem] right-3 z-20 border-t-2 border-rose-500/60" style={{ top: `${((currentMinute - preference.day_start_minutes) / durationMinutes) * 100}%` }}>
              <span className="absolute -top-3 right-[4.25rem] rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-medium text-white">当前时间</span>
            </div>
          ) : null}

          {loading ? (
            <div className="absolute inset-y-8 left-20 right-5 grid place-items-center rounded-xl border border-dashed border-gray-300 bg-white/80">
              <p className="text-sm text-gray-500" role="status">正在读取今天的安排…</p>
            </div>
          ) : error ? (
            <div className="absolute inset-y-8 left-20 right-5 grid place-items-center rounded-xl border border-red-100 bg-red-50/90" role="alert">
              <div className="max-w-sm text-center"><p className="font-medium text-red-700">时间线加载失败</p><p className="mt-1 text-sm text-red-600">{error}</p></div>
            </div>
          ) : blocks.length === 0 ? (
            <div className="pointer-events-none absolute inset-y-8 left-20 right-5 flex items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white/65 px-6 text-center">
              <div className="max-w-sm">
                <Clock3 aria-hidden="true" className="mx-auto mb-3 h-9 w-9 text-stone-400" />
                <p className="text-sm font-medium text-stone-700">把左侧计划或行动项拖到这里安排时间</p>
                <p className="mt-1 text-xs text-stone-400">也可以用候选事项上的“安排到今天”按钮</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
