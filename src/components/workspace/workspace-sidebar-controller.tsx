"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"

import { GoalCandidatePanel } from "@/components/today/goal-candidate-panel"
import { ScheduleBlockEditor, type ScheduleEditorSubmit } from "@/components/today/schedule-block-editor"
import { durationForCandidate, findNextFreeStart } from "@/components/today/scheduling-ui"
import { normalizeLocalDateInput } from "@/lib/focus-period-utils"
import { getDefaultPlanningPreference } from "@/lib/today/planning-preference"
import type { SchedulableCandidate, TodayView } from "@/lib/today/types"

type EditorIntent = {
  candidate: SchedulableCandidate
  initialStartMinutes: number
  initialEndMinutes: number
  idempotencyKey: string
}

function responseError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error
  }
  return fallback
}

export function WorkspaceSidebarController({ date }: { date?: string | null }) {
  const [localDate, setLocalDate] = useState<string | null>(() => date ?? null)
  const resolvedDate = date === undefined ? localDate : date
  const [view, setView] = useState<TodayView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorIntent | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const defaultPreference = useMemo(() => getDefaultPlanningPreference(), [])

  useEffect(() => {
    if (date === undefined) setLocalDate(normalizeLocalDateInput(new Date()))
  }, [date])

  const load = useCallback(async (requestedDate: string, signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/today?date=${encodeURIComponent(requestedDate)}`, signal ? { signal } : undefined)
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(responseError(payload, "工作台数据加载失败"))
      if (!payload || typeof payload !== "object" || (payload as TodayView).date !== requestedDate) {
        throw new Error("工作台数据格式无效")
      }
      setView(payload as TodayView)
      return true
    } catch (loadError) {
      if (signal?.aborted) return false
      setError(loadError instanceof Error ? loadError.message : "工作台数据加载失败")
      return false
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    setEditor(null)
    setEditorError(null)
    if (resolvedDate === null) {
      setView(null)
      setLoading(true)
      return
    }

    const controller = new AbortController()
    void load(resolvedDate, controller.signal)
    return () => controller.abort()
  }, [load, resolvedDate])

  useEffect(() => {
    if (resolvedDate === null) return
    const refresh = () => void load(resolvedDate)
    window.addEventListener("goal-mate:data-changed", refresh)
    return () => window.removeEventListener("goal-mate:data-changed", refresh)
  }, [load, resolvedDate])

  const preference = view?.preference ?? defaultPreference
  const candidates = view?.candidates ?? []

  const schedule = useCallback((candidate: SchedulableCandidate) => {
    if (resolvedDate === null) return
    if (!candidate.can_schedule || candidate.suggested_block_minutes === null) {
      setError(candidate.schedule_reason ?? "当前事项暂不可安排")
      return
    }
    const duration = durationForCandidate(candidate.suggested_block_minutes, preference)
    const start = findNextFreeStart(resolvedDate, duration, preference, view?.blocks ?? [])
    if (start === null) {
      setError("当天规划范围内没有足够的无冲突时间")
      return
    }
    setError(null)
    setEditorError(null)
    setEditor({
      candidate,
      initialStartMinutes: start,
      initialEndMinutes: start + duration,
      idempotencyKey: crypto.randomUUID(),
    })
  }, [preference, resolvedDate, view?.blocks])

  const submit = useCallback(async (payload: ScheduleEditorSubmit) => {
    if (editor === null || resolvedDate === null || saving) return
    setSaving(true)
    setEditorError(null)
    try {
      const response = await fetch("/api/schedule-block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": editor.idempotencyKey,
        },
        body: JSON.stringify({
          plan_id: editor.candidate.plan_id,
          action_id: editor.candidate.action_id,
          start_at: payload.start_at,
          end_at: payload.end_at,
          status: "scheduled",
          source: "manual",
        }),
      })
      const responsePayload: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(responseError(responsePayload, "创建时间块失败"))
      const refreshed = await load(resolvedDate)
      if (!refreshed) throw new Error("安排已保存，但工作台刷新失败")
      setEditor(null)
      window.dispatchEvent(new CustomEvent("goal-mate:data-changed", { detail: { entity: "schedule-block" } }))
    } catch (submitError) {
      setEditorError(submitError instanceof Error ? submitError.message : "创建时间块失败")
    } finally {
      setSaving(false)
    }
  }, [editor, load, resolvedDate, saving])

  return (
    <>
      <GoalCandidatePanel
        candidates={candidates}
        error={error}
        focus={view?.focus ?? null}
        loading={loading}
        onSchedule={schedule}
      />
      {editor && resolvedDate ? (
        <ScheduleBlockEditor
          block={null}
          candidate={editor.candidate}
          date={resolvedDate}
          error={editorError}
          initialEndMinutes={editor.initialEndMinutes}
          initialStartMinutes={editor.initialStartMinutes}
          loading={saving}
          onCancelBlock={async () => undefined}
          onClose={() => {
            if (!saving) setEditor(null)
          }}
          onIntentChange={() => {
            setEditorError(null)
            setEditor(current => current ? { ...current, idempotencyKey: crypto.randomUUID() } : current)
          }}
          onSubmit={submit}
          planName={editor.candidate.kind === "plan" ? editor.candidate.name : null}
          preference={preference}
        />
      ) : null}
    </>
  )
}
