"use client"

import * as React from "react"
import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type { FocusPeriodView, GoalOption } from "./types"

interface FocusPeriodEditorRowProps {
  period: FocusPeriodView
  goals: GoalOption[]
  index: number
  onSave: (period: FocusPeriodView) => Promise<FocusPeriodView | void> | FocusPeriodView | void
  onDelete: (periodId: string) => Promise<void> | void
}

function getGoalLabel(goal: Pick<GoalOption, "name" | "tag">): string {
  return `${goal.name} · ${goal.tag}`
}

function getPeriodKey(period: FocusPeriodView): string {
  return [
    period.period_id,
    period.year,
    period.start_date,
    period.end_date,
    period.goal_id,
    period.color,
  ].join("|")
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return "保存失败，请重试"
}

function isCompletePeriod(period: FocusPeriodView): boolean {
  return Boolean(period.goal_id && period.start_date && period.end_date)
}

export function FocusPeriodEditorRow({ period, goals, index, onSave, onDelete }: FocusPeriodEditorRowProps) {
  const [draft, setDraft] = React.useState(period)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const previousPeriodRef = React.useRef(period)
  const lastSavedKeyRef = React.useRef(getPeriodKey(period))

  const goalOptions = React.useMemo(() => goals.map(getGoalLabel), [goals])
  const goalsByLabel = React.useMemo(() => {
    return new Map(goals.map(goal => [getGoalLabel(goal), goal]))
  }, [goals])
  const selectedGoal = React.useMemo(() => goals.find(goal => goal.goal_id === draft.goal_id), [draft.goal_id, goals])
  const selectedGoalLabel = selectedGoal ? getGoalLabel(selectedGoal) : ""

  React.useEffect(() => {
    setDraft(period)
    setError(null)
    previousPeriodRef.current = period
    lastSavedKeyRef.current = getPeriodKey(period)
  }, [period])

  React.useEffect(() => {
    const draftKey = getPeriodKey(draft)

    if (draftKey === lastSavedKeyRef.current || !isCompletePeriod(draft)) {
      return
    }

    let cancelled = false
    setSaving(true)
    setError(null)

    Promise.resolve(onSave(draft))
      .then(savedPeriod => {
        if (cancelled) {
          return
        }

        const nextPeriod = savedPeriod ?? draft
        previousPeriodRef.current = nextPeriod
        lastSavedKeyRef.current = getPeriodKey(nextPeriod)
        if (savedPeriod) {
          setDraft(savedPeriod)
        }
      })
      .catch(saveError => {
        if (cancelled) {
          return
        }

        const previousPeriod = previousPeriodRef.current
        setDraft(previousPeriod)
        lastSavedKeyRef.current = getPeriodKey(previousPeriod)
        setError(getErrorMessage(saveError))
      })
      .finally(() => {
        if (!cancelled) {
          setSaving(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [draft, onSave])

  function updateDraft(updates: Partial<FocusPeriodView>) {
    setDraft(current => ({ ...current, ...updates }))
  }

  function handleGoalChange(label: string) {
    const goal = goalsByLabel.get(label)
    if (!goal) {
      return
    }

    updateDraft({
      goal_id: goal.goal_id,
      goal: {
        goal_id: goal.goal_id,
        name: goal.name,
        tag: goal.tag,
      },
    })
  }

  return (
    <div className="space-y-3 rounded-md border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">阶段 {index + 1}</p>
          {draft.goal === null && draft.goal_id ? (
            <p className="mt-1 text-xs text-destructive">目标已删除，请重新选择或删除该阶段</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(draft.period_id)}
          disabled={saving}
          aria-label="删除阶段"
          title="删除阶段"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_5rem]">
        <div className="space-y-2">
          <Label>绑定目标</Label>
          <Combobox
            options={goalOptions}
            value={selectedGoalLabel}
            onChange={handleGoalChange}
            placeholder="搜索目标"
            className="w-full"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${draft.period_id}-start`}>开始日期</Label>
          <Input
            id={`${draft.period_id}-start`}
            type="date"
            value={draft.start_date}
            onChange={event => updateDraft({ start_date: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${draft.period_id}-end`}>结束日期</Label>
          <Input
            id={`${draft.period_id}-end`}
            type="date"
            value={draft.end_date}
            onChange={event => updateDraft({ end_date: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${draft.period_id}-color`}>颜色</Label>
          <Input
            id={`${draft.period_id}-color`}
            type="color"
            value={draft.color}
            onChange={event => updateDraft({ color: event.target.value })}
            className="p-1"
          />
        </div>
      </div>

      <div className="min-h-5 text-xs">
        {error ? <p className="text-destructive">{error}</p> : null}
        {!error && saving ? <p className="text-muted-foreground">保存中...</p> : null}
      </div>
    </div>
  )
}
