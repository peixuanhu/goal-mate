"use client"

import { useDraggable } from "@dnd-kit/core"
import { CheckCircle2, ChevronDown, ChevronUp, GripVertical, Pencil } from "lucide-react"
import React from "react"

import type { ScheduleBlockView } from "@/lib/today/types"

import { minuteToTimeInput, type TimelineRange } from "./scheduling-ui"

export type ResizeEdge = "start" | "end"

export interface InteractiveScheduleBlockProps {
  block: ScheduleBlockView
  localRange: TimelineRange
  style: React.CSSProperties
  statusLabel: string
  statusClassName: string
  disabled: boolean
  timelineInteractionDisabled?: boolean
  onEdit: (block: ScheduleBlockView) => void
  onComplete: (block: ScheduleBlockView) => void
  onResizePointerDown: (block: ScheduleBlockView, edge: ResizeEdge, event: React.PointerEvent<HTMLButtonElement>) => void
}

export function InteractiveScheduleBlock({
  block,
  localRange,
  style,
  statusLabel,
  statusClassName,
  disabled,
  timelineInteractionDisabled = false,
  onEdit,
  onComplete,
  onResizePointerDown,
}: InteractiveScheduleBlockProps) {
  const scheduled = block.status === "scheduled"
  const compact = localRange.end - localRange.start <= 15
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } = useDraggable({
    id: `schedule-block:${block.block_id}`,
    data: { kind: "schedule-block", block, localRange },
    disabled: disabled || timelineInteractionDisabled || block.status !== "scheduled",
  })
  const openEditorFromResizeHandle = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    event.stopPropagation()
    onEdit(block)
  }

  return (
    <article
      aria-label={`${block.title}，${statusLabel}`}
      className={`absolute overflow-hidden rounded-lg border shadow-sm ${scheduled ? "pointer-events-auto left-[4.5rem] right-3 z-20" : "pointer-events-none left-[4.75rem] right-2 z-10 opacity-75"} ${statusClassName} ${isDragging ? "opacity-60 shadow-lg ring-2 ring-violet-400/70" : ""}`}
      ref={setNodeRef}
      style={style}
    >
      {scheduled ? (
        <>
          <button
            aria-label={`调整 ${block.title} 的开始时间`}
            className="touch-none absolute inset-x-0 top-0 z-10 h-3 cursor-ns-resize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            disabled={disabled || timelineInteractionDisabled}
            onKeyDown={openEditorFromResizeHandle}
            onPointerDown={event => onResizePointerDown(block, "start", event)}
            type="button"
          >
            <ChevronUp aria-hidden="true" className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 opacity-60" />
          </button>
          <button
            aria-label={`调整 ${block.title} 的结束时间`}
            className="touch-none absolute inset-x-0 bottom-0 z-10 h-3 cursor-ns-resize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            disabled={disabled || timelineInteractionDisabled}
            onKeyDown={openEditorFromResizeHandle}
            onPointerDown={event => onResizePointerDown(block, "end", event)}
            type="button"
          >
            <ChevronDown aria-hidden="true" className="absolute bottom-0 left-1/2 h-3 w-3 -translate-x-1/2 opacity-60" />
          </button>
        </>
      ) : null}

      <div className={`absolute inset-x-3 top-3 bottom-3 z-20 flex justify-between gap-2 overflow-hidden ${compact ? "items-center" : "items-start"}`}>
        {compact ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <p className="min-w-0 truncate text-sm font-semibold">{block.title}</p>
            <p className="shrink-0 whitespace-nowrap text-[11px] tabular-nums opacity-70">{minuteToTimeInput(localRange.start)}–{minuteToTimeInput(localRange.end)} · {statusLabel}</p>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{block.title}</p>
            <p className="mt-0.5 text-[11px] tabular-nums opacity-70">{minuteToTimeInput(localRange.start)}–{minuteToTimeInput(localRange.end)} · {statusLabel}</p>
          </div>
        )}
        {scheduled ? (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
            <button
              aria-label={`移动 ${block.title}`}
              className="touch-none cursor-grab rounded-md p-1 hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 active:cursor-grabbing"
              disabled={disabled || timelineInteractionDisabled}
              ref={setActivatorNodeRef}
              type="button"
              {...attributes}
              {...listeners}
            >
              <GripVertical aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label={`编辑 ${block.title}`}
              className="rounded-md p-1 hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              disabled={disabled}
              onClick={event => {
                event.stopPropagation()
                onEdit(block)
              }}
              type="button"
            >
              <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label={`完成 ${block.title}`}
              className="rounded-md p-1 hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              disabled={disabled}
              onClick={event => {
                event.stopPropagation()
                onComplete(block)
              }}
              type="button"
            >
              <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </article>
  )
}
