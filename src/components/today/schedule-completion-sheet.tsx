"use client"

import { X } from "lucide-react"
import React, { useRef, useState } from "react"

import type { ScheduleBlockView } from "@/lib/today/types"

import { useModalAccessibility } from "./use-modal-accessibility"

export type ScheduleCompletionPayload = {
  block_id: string
  expected_version: number
  outcome: "completed" | "partial" | "skipped"
  content?: string
  thinking?: string
  result_note?: string
  plan_progress?: number
}

interface ScheduleCompletionSheetProps {
  block: ScheduleBlockView
  isOrdinaryPlan: boolean
  loading: boolean
  error: string | null
  onSubmit: (payload: ScheduleCompletionPayload) => Promise<void>
  onClose: () => void
}

export function ScheduleCompletionSheet({ block, isOrdinaryPlan, loading, error, onSubmit, onClose }: ScheduleCompletionSheetProps) {
  const [outcome, setOutcome] = useState<ScheduleCompletionPayload["outcome"]>("completed")
  const [content, setContent] = useState("")
  const [thinking, setThinking] = useState("")
  const [resultNote, setResultNote] = useState("")
  const [planProgress, setPlanProgress] = useState(50)
  const [updatePlanProgress, setUpdatePlanProgress] = useState(false)
  const firstOutcomeRef = useRef<HTMLInputElement>(null)
  const { modalRef } = useModalAccessibility({
    initialFocusRef: firstOutcomeRef,
    loading,
    onClose,
  })

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    await onSubmit({
      block_id: block.block_id,
      expected_version: block.version,
      outcome,
      ...(outcome !== "skipped" && content ? { content } : {}),
      ...(outcome !== "skipped" && thinking ? { thinking } : {}),
      ...(resultNote ? { result_note: resultNote } : {}),
      ...(isOrdinaryPlan && updatePlanProgress ? { plan_progress: planProgress / 100 } : {}),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/35 p-0 sm:items-center sm:p-4" onMouseDown={event => {
      if (event.currentTarget === event.target && !loading) onClose()
    }}>
      <section aria-labelledby="completion-sheet-title" aria-modal="true" className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-5 shadow-2xl sm:rounded-2xl" ref={modalRef} role="dialog" tabIndex={-1}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-600">记录结果</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-950" id="completion-sheet-title">记录时间块结果</h2>
            <p className="mt-1 text-sm text-gray-500">{block.title}</p>
          </div>
          <button aria-label="关闭" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" disabled={loading} onClick={onClose} type="button"><X aria-hidden="true" className="h-4 w-4" /></button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          <fieldset>
            <legend className="text-sm font-medium text-gray-700">结果</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <label className="rounded-xl border border-gray-200 p-3 text-center text-sm has-[:checked]:border-emerald-400 has-[:checked]:bg-emerald-50">
                <input className="sr-only" checked={outcome === "completed"} disabled={loading} name="outcome" onChange={() => setOutcome("completed")} ref={firstOutcomeRef} type="radio" value="completed" />
                完成
              </label>
              <label className="rounded-xl border border-gray-200 p-3 text-center text-sm has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50">
                <input className="sr-only" checked={outcome === "partial"} disabled={loading} name="outcome" onChange={() => setOutcome("partial")} type="radio" value="partial" />
                部分完成
              </label>
              <label className="rounded-xl border border-gray-200 p-3 text-center text-sm has-[:checked]:border-gray-400 has-[:checked]:bg-gray-50">
                <input className="sr-only" checked={outcome === "skipped"} disabled={loading} name="outcome" onChange={() => setOutcome("skipped")} type="radio" value="skipped" />
                跳过
              </label>
            </div>
          </fieldset>

          {outcome !== "skipped" ? (
            <>
              <label className="block text-sm font-medium text-gray-700">完成内容
                <textarea aria-label="完成内容" className="mt-1 min-h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" disabled={loading} onChange={event => setContent(event.currentTarget.value)} value={content} />
              </label>
              <label className="block text-sm font-medium text-gray-700">过程思考
                <textarea aria-label="过程思考" className="mt-1 min-h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" disabled={loading} onChange={event => setThinking(event.currentTarget.value)} value={thinking} />
              </label>
            </>
          ) : null}
          <label className="block text-sm font-medium text-gray-700">结果备注
            <textarea aria-label="结果备注" className="mt-1 min-h-16 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" disabled={loading} onChange={event => setResultNote(event.currentTarget.value)} value={resultNote} />
          </label>

          {isOrdinaryPlan ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input checked={updatePlanProgress} disabled={loading} onChange={event => setUpdatePlanProgress(event.currentTarget.checked)} type="checkbox" />
                同时更新计划进度
              </label>
              <label className="mt-3 block text-sm font-medium text-gray-700">计划进度 <span className="font-normal text-gray-400">{planProgress}%</span>
                <input aria-label="计划进度" className="mt-2 w-full accent-indigo-600 disabled:opacity-50" disabled={loading || !updatePlanProgress} max="100" min="0" onChange={event => setPlanProgress(Number(event.currentTarget.value))} step="1" type="range" value={planProgress} />
              </label>
            </div>
          ) : null}

          {error ? <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div> : null}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50" disabled={loading} onClick={onClose} type="button">关闭</button>
            <button className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={loading} type="submit">{loading ? "正在保存…" : "保存结果"}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
