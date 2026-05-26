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

interface GoalLabelData {
  options: string[]
  goalsByLabel: Map<string, GoalOption>
  labelsByGoalId: Map<string, string>
}

const AUTOSAVE_DELAY_MS = 300

function getBaseGoalLabel(goal: Pick<GoalOption, "name" | "tag">): string {
  return `${goal.name} · ${goal.tag}`
}

function buildGoalLabelData(goals: GoalOption[]): GoalLabelData {
  const baseLabelCounts = new Map<string, number>()
  goals.forEach(goal => {
    const baseLabel = getBaseGoalLabel(goal)
    baseLabelCounts.set(baseLabel, (baseLabelCounts.get(baseLabel) ?? 0) + 1)
  })

  const options: string[] = []
  const goalsByLabel = new Map<string, GoalOption>()
  const labelsByGoalId = new Map<string, string>()

  goals.forEach(goal => {
    const baseLabel = getBaseGoalLabel(goal)
    const label = (baseLabelCounts.get(baseLabel) ?? 0) > 1 ? `${baseLabel} · ${goal.goal_id}` : baseLabel

    options.push(label)
    goalsByLabel.set(label, goal)
    labelsByGoalId.set(goal.goal_id, label)
  })

  return { options, goalsByLabel, labelsByGoalId }
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
  const latestDraftRef = React.useRef(period)
  const inFlightRef = React.useRef(false)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const goalLabelData = React.useMemo(() => buildGoalLabelData(goals), [goals])
  const selectedGoal = React.useMemo(
    () => goals.find(goal => goal.goal_id === draft.goal_id) ?? draft.goal,
    [draft.goal, draft.goal_id, goals],
  )
  const selectedGoalLabel = selectedGoal
    ? goalLabelData.labelsByGoalId.get(selectedGoal.goal_id) ?? getBaseGoalLabel(selectedGoal)
    : ""

  const flushAutosave = React.useCallback(async () => {
    if (inFlightRef.current) {
      return
    }

    const draftToSave = latestDraftRef.current
    const draftKey = getPeriodKey(draftToSave)

    if (draftKey === lastSavedKeyRef.current || !isCompletePeriod(draftToSave)) {
      return
    }

    inFlightRef.current = true
    setSaving(true)
    setError(null)

    try {
      const savedPeriod = await Promise.resolve(onSave(draftToSave))
      const nextPeriod = savedPeriod ?? draftToSave
      const nextPeriodKey = getPeriodKey(nextPeriod)
      const latestKey = getPeriodKey(latestDraftRef.current)

      previousPeriodRef.current = nextPeriod
      lastSavedKeyRef.current = nextPeriodKey

      if (savedPeriod && latestKey === draftKey) {
        latestDraftRef.current = savedPeriod
        setDraft(savedPeriod)
      } else if (savedPeriod && latestDraftRef.current.period_id === draftToSave.period_id) {
        const latestWithSavedId = {
          ...latestDraftRef.current,
          period_id: savedPeriod.period_id,
        }
        latestDraftRef.current = latestWithSavedId
        setDraft(latestWithSavedId)
      }
    } catch (saveError) {
      const latestKey = getPeriodKey(latestDraftRef.current)

      if (latestKey === draftKey) {
        const previousPeriod = previousPeriodRef.current
        latestDraftRef.current = previousPeriod
        setDraft(previousPeriod)
        lastSavedKeyRef.current = getPeriodKey(previousPeriod)
        setError(getErrorMessage(saveError))
      }
    } finally {
      inFlightRef.current = false
      setSaving(false)

      const latestDraft = latestDraftRef.current
      if (isCompletePeriod(latestDraft) && getPeriodKey(latestDraft) !== lastSavedKeyRef.current) {
        void flushAutosave()
      }
    }
  }, [onSave])

  React.useEffect(() => {
    setDraft(period)
    setError(null)
    previousPeriodRef.current = period
    lastSavedKeyRef.current = getPeriodKey(period)
    latestDraftRef.current = period
  }, [period])

  React.useEffect(() => {
    latestDraftRef.current = draft
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (!isCompletePeriod(draft) || getPeriodKey(draft) === lastSavedKeyRef.current) {
      return
    }

    debounceRef.current = setTimeout(() => {
      void flushAutosave()
    }, AUTOSAVE_DELAY_MS)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [draft, flushAutosave])

  function updateDraft(updates: Partial<FocusPeriodView>) {
    setDraft(current => ({ ...current, ...updates }))
  }

  function handleGoalChange(label: string) {
    const goal = goalLabelData.goalsByLabel.get(label)
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

  async function handleDelete() {
    setError(null)

    try {
      await Promise.resolve(onDelete(draft.period_id))
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
    }
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
          onClick={handleDelete}
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
            options={goalLabelData.options}
            value={selectedGoalLabel}
            onChange={handleGoalChange}
            placeholder="搜索目标"
            className="w-full"
            allowCustomOption={false}
            emptyMessage="没有匹配的目标"
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
