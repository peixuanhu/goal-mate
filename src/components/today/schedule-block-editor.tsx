"use client"

import { X } from "lucide-react"
import React, { useMemo, useState } from "react"

import type { PlanningPreferenceView, ScheduleBlockView, SchedulableCandidate } from "@/lib/today/types"

import {
  localTimeRangeToUtc,
  minuteToTimeInput,
  toLocalBlockRange,
} from "./scheduling-ui"

export type ScheduleEditorSubmit = {
  start_at: string
  end_at: string
  expected_version?: number
}

interface ScheduleBlockEditorProps {
  block: ScheduleBlockView | null
  candidate: SchedulableCandidate | null
  date: string
  preference: PlanningPreferenceView
  planName?: string | null
  initialStartMinutes: number
  initialEndMinutes: number
  loading: boolean
  error: string | null
  onSubmit: (payload: ScheduleEditorSubmit) => Promise<void>
  onCancelBlock: (payload: { block_id: string; expected_version: number }) => Promise<void>
  onIntentChange: () => void
  onClose: () => void
}

function initialRange(
  block: ScheduleBlockView | null,
  date: string,
  preference: PlanningPreferenceView,
  initialStartMinutes: number,
  initialEndMinutes: number,
): { start: number; end: number } {
  if (block === null) return { start: initialStartMinutes, end: initialEndMinutes }
  try {
    return toLocalBlockRange(block.start_at, block.end_at, preference.timezone, date)
  } catch {
    return { start: initialStartMinutes, end: initialEndMinutes }
  }
}

export function ScheduleBlockEditor({
  block,
  candidate,
  date,
  preference,
  planName,
  initialStartMinutes,
  initialEndMinutes,
  loading,
  error,
  onSubmit,
  onCancelBlock,
  onIntentChange,
  onClose,
}: ScheduleBlockEditorProps) {
  const range = useMemo(
    () => initialRange(block, date, preference, initialStartMinutes, initialEndMinutes),
    [block, date, initialEndMinutes, initialStartMinutes, preference],
  )
  const [startValue, setStartValue] = useState(() => minuteToTimeInput(range.start))
  const [endValue, setEndValue] = useState(() => minuteToTimeInput(range.end))
  const [localError, setLocalError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const title = candidate?.name ?? block?.title ?? "时间块"
  const goalName = candidate?.goal_name ?? block?.goal_name
  const isEdit = block !== null

  function changeStart(value: string) {
    setStartValue(value)
    setLocalError(null)
    onIntentChange()
  }

  function changeEnd(value: string) {
    setEndValue(value)
    setLocalError(null)
    onIntentChange()
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setLocalError(null)
    try {
      const interval = localTimeRangeToUtc(date, startValue, endValue, preference)
      await onSubmit({
        start_at: interval.start_at,
        end_at: interval.end_at,
        ...(block ? { expected_version: block.version } : {}),
      })
    } catch (submitError) {
      setLocalError(submitError instanceof Error && submitError.message ? submitError.message : "时间设置无效")
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-gray-950/35 p-4" onMouseDown={event => {
      if (event.currentTarget === event.target && !loading) onClose()
    }}>
      <section aria-labelledby="schedule-editor-title" aria-modal="true" className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-indigo-500">{isEdit ? "调整安排" : "新建安排"}</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-950" id="schedule-editor-title">{isEdit ? "编辑时间块" : "安排时间块"}</h2>
          </div>
          <button aria-label="关闭" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" disabled={loading} onClick={onClose} type="button">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-xl bg-gray-50 px-3 py-3">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
            {goalName ? <span>目标：{goalName}</span> : null}
            <span>计划：{planName ?? (candidate?.kind === "plan" ? candidate.name : candidate?.plan_id ?? block?.plan_id)}</span>
            {(candidate?.action_id ?? block?.action_id) ? <span>行动项：{title}</span> : <span>直接计划块</span>}
          </div>
        </div>

        <form className="mt-4 space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-gray-700">
              开始时间
              <input aria-label="开始时间" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm tabular-nums focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" disabled={loading} onChange={event => changeStart(event.currentTarget.value)} pattern="(?:[01]\d|2[0-3]):[0-5]\d" value={startValue} />
            </label>
            <label className="text-sm font-medium text-gray-700">
              结束时间
              <input aria-label="结束时间" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm tabular-nums focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" disabled={loading} onChange={event => changeEnd(event.currentTarget.value)} pattern="(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)" value={endValue} />
            </label>
          </div>
          <p className="text-xs text-gray-400">{date} · {preference.timezone} · 15 分钟刻度</p>

          {localError || error ? (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{localError ?? error}</div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4">
            {isEdit ? (
              confirmCancel ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600">确认取消而不删除记录？</span>
                  <button className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50" disabled={loading} onClick={() => void onCancelBlock({ block_id: block.block_id, expected_version: block.version })} type="button">确认取消</button>
                </div>
              ) : (
                <button className="rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50" disabled={loading} onClick={() => setConfirmCancel(true)} type="button">取消此时间块</button>
              )
            ) : <span />}
            <div className="ml-auto flex gap-2">
              <button className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50" disabled={loading} onClick={onClose} type="button">关闭</button>
              <button className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={loading} type="submit">{loading ? "正在保存…" : isEdit ? "保存时间" : "确认安排"}</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}
