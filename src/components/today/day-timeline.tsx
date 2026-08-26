"use client"

import { useDroppable } from "@dnd-kit/core"
import { CheckCircle2, Clock3, Pencil } from "lucide-react"
import React, { useEffect, useMemo, useRef, useState } from "react"

import { formatUtcInTimeZone } from "@/lib/today/timezone"
import type { PlanningPreferenceView, ScheduleBlockStatus, ScheduleBlockView } from "@/lib/today/types"

import { minuteToTimeInput, toLocalBlockRange } from "./scheduling-ui"

interface DayTimelineProps {
  date: string
  preference: PlanningPreferenceView
  blocks: ScheduleBlockView[]
  loading: boolean
  error: string | null
  onEditBlock: (block: ScheduleBlockView) => void
  onCompleteBlock: (block: ScheduleBlockView) => void
}

export const MAX_TIMELINE_MARKERS = 26
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

function buildTimelineMarkers(dayStartMinutes: number, dayEndMinutes: number): number[] {
  const markers = [dayStartMinutes]
  let cursor = (Math.floor(dayStartMinutes / 60) + 1) * 60
  while (cursor < dayEndMinutes && markers.length < MAX_TIMELINE_MARKERS - 1) {
    markers.push(cursor)
    cursor += 60
  }
  if (markers.at(-1) !== dayEndMinutes) markers.push(dayEndMinutes)
  return markers
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

export function DayTimeline({ date, preference, blocks, loading, error, onEditBlock, onCompleteBlock }: DayTimelineProps) {
  const { isOver, setNodeRef } = useDroppable({ id: "today-timeline" })
  const scrollViewportRef = useRef<HTMLDivElement>(null)
  const autoPositionedDateRef = useRef<string | null>(null)
  const markers = useMemo(
    () => buildTimelineMarkers(preference.day_start_minutes, preference.day_end_minutes),
    [preference.day_end_minutes, preference.day_start_minutes],
  )
  const durationMinutes = preference.day_end_minutes - preference.day_start_minutes
  const timelineHeight = Math.max(520, Math.ceil(durationMinutes * TIMELINE_PIXELS_PER_MINUTE))
  const currentMinute = useCurrentLocalMinute(date, preference.timezone)
  const showCurrentTime = currentMinute !== null
    && currentMinute >= preference.day_start_minutes
    && currentMinute < preference.day_end_minutes

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
        <div className={`relative transition-colors ${isOver ? "bg-violet-50/70" : ""}`} data-testid="today-timeline-dropzone" ref={setNodeRef} style={{ minHeight: timelineHeight }}>
          {markers.map((minutes, index) => {
            const top = durationMinutes === 0 ? 0 : ((minutes - preference.day_start_minutes) / durationMinutes) * 100
            const markerAlignment = index === 0
              ? "translate-y-0"
              : index === markers.length - 1
                ? "-translate-y-full"
                : "-translate-y-1/2"
            return (
              <div className="absolute inset-x-0 flex items-start" key={minutes} style={{ top: `${top}%` }}>
                <time className={`w-16 ${markerAlignment} pr-3 text-right text-xs tabular-nums text-stone-400`}>{formatMinutes(minutes)}</time>
                <div className={`flex-1 border-t ${index === 0 || index === markers.length - 1 ? "border-stone-200" : "border-dashed border-stone-200/80"}`} />
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
            const editable = block.status === "scheduled"
            return (
              <article
                aria-label={`${block.title}，${STATUS_LABELS[block.status]}`}
                className={`absolute overflow-hidden rounded-xl border px-3 py-2 shadow-sm ${editable ? "pointer-events-auto left-[4.5rem] right-3 z-20" : "pointer-events-none left-[4.75rem] right-2 z-10 opacity-75"} ${STATUS_CLASSES[block.status]}`}
                key={block.block_id}
                style={{ top: `${top}%`, height: `${height}%`, minHeight: 48 }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{block.title}</p>
                    <p className="mt-0.5 text-[11px] tabular-nums opacity-70">{formatMinutes(local.start)}–{formatMinutes(local.end)} · {STATUS_LABELS[block.status]}</p>
                  </div>
                  {editable ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button aria-label={`编辑 ${block.title}`} className="rounded-md p-1 hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" onClick={() => onEditBlock(block)} type="button">
                        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                      <button aria-label={`完成 ${block.title}`} className="rounded-md p-1 hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" onClick={() => onCompleteBlock(block)} type="button">
                        <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })}

          {showCurrentTime && currentMinute !== null ? (
            <div aria-label={`当前时间 ${formatMinutes(currentMinute)}`} className="pointer-events-none absolute inset-x-16 z-20 border-t-2 border-rose-500" style={{ top: `${((currentMinute - preference.day_start_minutes) / durationMinutes) * 100}%` }}>
              <span className="absolute -top-3 right-4 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-medium text-white">当前时间</span>
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
