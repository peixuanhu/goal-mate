"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { findCurrentFocusPeriod } from "@/lib/focus-period-utils"
import { getRecurringTaskDetails, getRecurrenceTypeDisplay } from "@/lib/recurring-utils"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useRouter } from "next/navigation"

import { FocusPeriodDrawer } from "./focus-period-drawer"
import type { FocusPeriodView, GoalOption } from "./types"
import { YearTimeline } from "./year-timeline"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isDraftPeriod(period: FocusPeriodView): boolean {
  return period.period_id.startsWith("draft_")
}

function isFocusGoalSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.goal_id === "string" &&
    typeof value.name === "string" &&
    typeof value.tag === "string"
  )
}

function isFocusPeriodView(value: unknown): value is FocusPeriodView {
  return (
    isRecord(value) &&
    typeof value.period_id === "string" &&
    typeof value.year === "number" &&
    typeof value.start_date === "string" &&
    typeof value.end_date === "string" &&
    typeof value.goal_id === "string" &&
    typeof value.color === "string" &&
    (value.goal === null || value.goal === undefined || isFocusGoalSummary(value.goal))
  )
}

function isGoalOption(value: unknown): value is GoalOption {
  return (
    isRecord(value) &&
    typeof value.goal_id === "string" &&
    typeof value.name === "string" &&
    typeof value.tag === "string"
  )
}

type FocusPlan = {
  plan_id: string
  name: string
  difficulty: string | null
  progress: number
  is_recurring: boolean
  recurrence_type: string | null
  recurrence_value: string | null
  progressRecords?: Array<{
    gmt_create: string
    counts_toward_recurrence?: boolean
  }>
}

function isProgressRecord(value: unknown): value is {
  gmt_create: string
  counts_toward_recurrence?: boolean
} {
  return isRecord(value)
    && typeof value.gmt_create === "string"
    && (value.counts_toward_recurrence === undefined || typeof value.counts_toward_recurrence === "boolean")
}

function isFocusPlan(value: unknown): value is FocusPlan {
  return (
    isRecord(value) &&
    typeof value.plan_id === "string" &&
    typeof value.name === "string" &&
    (value.difficulty === null || value.difficulty === undefined || typeof value.difficulty === "string") &&
    typeof value.progress === "number" &&
    typeof value.is_recurring === "boolean" &&
    (value.recurrence_type === null || value.recurrence_type === undefined || typeof value.recurrence_type === "string") &&
    (value.recurrence_value === null || value.recurrence_value === undefined || typeof value.recurrence_value === "string") &&
    (value.progressRecords === undefined || (Array.isArray(value.progressRecords) && value.progressRecords.every(isProgressRecord)))
  )
}

function parseFocusPlanList(data: unknown): FocusPlan[] {
  if (!isRecord(data) || !Array.isArray(data.list) || !data.list.every(isFocusPlan)) {
    throw new Error("关联计划数据格式无效")
  }

  return data.list
}

export function formatFocusPlanProgress(plan: FocusPlan): string {
  if (plan.is_recurring) {
    const details = getRecurringTaskDetails({
      ...plan,
      recurrence_type: plan.recurrence_type ?? undefined,
      recurrence_value: plan.recurrence_value ?? undefined,
      progressRecords: (plan.progressRecords ?? []).map(record => ({
        gmt_create: new Date(record.gmt_create),
        counts_toward_recurrence: record.counts_toward_recurrence,
      })),
    })

    return details ? `${details.progressText} ${details.statusText}` : getRecurrenceTypeDisplay(plan.recurrence_type || "")
  }

  return `${Math.round((plan.progress || 0) * 100)}%`
}

function formatPlanRecentProgress(plan: FocusPlan): string {
  const firstRecord = plan.progressRecords?.[0]
  if (!firstRecord) return "暂无进展"

  return new Date(firstRecord.gmt_create).toLocaleDateString("zh-CN")
}

function getPlanDifficultyClass(difficulty?: string | null): string {
  switch (difficulty) {
    case "hard":
    case "high":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
    case "easy":
    case "low":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
    default:
      return "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-200"
  }
}

function parseFocusPeriodList(data: unknown): FocusPeriodView[] {
  if (!isRecord(data) || !Array.isArray(data.list) || !data.list.every(isFocusPeriodView)) {
    throw new Error("专注阶段数据格式无效")
  }

  return data.list
}

function parseGoalList(data: unknown): GoalOption[] {
  if (!isRecord(data) || !Array.isArray(data.list) || !data.list.every(isGoalOption)) {
    throw new Error("目标列表数据格式无效")
  }

  return data.list
}

function sortPeriods(periods: FocusPeriodView[]): FocusPeriodView[] {
  return [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date))
}

function formatMonthDay(date: string): string {
  return date.slice(5).replace("-", "/")
}

function formatDateRange(period: Pick<FocusPeriodView, "start_date" | "end_date">): string {
  return `${formatMonthDay(period.start_date)} - ${formatMonthDay(period.end_date)}`
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { error?: string; message?: string }
    return data.error ?? data.message ?? fallback
  } catch {
    return fallback
  }
}

export function FocusOverview() {
  const router = useRouter()
  const [year, setYear] = React.useState(() => new Date().getFullYear())
  const [periods, setPeriods] = React.useState<FocusPeriodView[]>([])
  const [goals, setGoals] = React.useState<GoalOption[]>([])
  const [focusPlans, setFocusPlans] = React.useState<FocusPlan[]>([])
  const [focusPlansOpen, setFocusPlansOpen] = React.useState(false)
  const [focusPlansLoading, setFocusPlansLoading] = React.useState(false)
  const [focusPlansError, setFocusPlansError] = React.useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const requestIdRef = React.useRef(0)
  const plansRequestIdRef = React.useRef(0)
  const localMutationVersionRef = React.useRef(0)

  const loadFocusData = React.useCallback(async () => {
    const requestId = requestIdRef.current + 1
    const mutationVersion = localMutationVersionRef.current
    requestIdRef.current = requestId

    setLoading(true)
    setError(null)
    setPeriods([])

    try {
      const targetYear = year
      const [periodsResponse, goalsResponse] = await Promise.all([
        fetch(`/api/focus-period?year=${targetYear}`),
        fetch("/api/goal?pageSize=1000"),
      ])

      if (!periodsResponse.ok) {
        throw new Error(await readApiError(periodsResponse, "专注阶段加载失败"))
      }
      if (!goalsResponse.ok) {
        throw new Error(await readApiError(goalsResponse, "目标列表加载失败"))
      }

      const loadedPeriods = parseFocusPeriodList(await periodsResponse.json())
      const loadedGoals = parseGoalList(await goalsResponse.json())

      if (requestIdRef.current !== requestId) {
        return
      }

      if (localMutationVersionRef.current === mutationVersion) {
        setPeriods(sortPeriods(loadedPeriods))
      }
      setGoals(loadedGoals)
    } catch (loadError) {
      if (requestIdRef.current !== requestId) {
        return
      }

      if (localMutationVersionRef.current === mutationVersion) {
        setPeriods([])
      }
      setError(loadError instanceof Error && loadError.message ? loadError.message : "专注概览加载失败")
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [year])

  React.useEffect(() => {
    void loadFocusData()
  }, [loadFocusData])

  const loadFocusPlans = React.useCallback(async (goalId?: string) => {
    const requestId = plansRequestIdRef.current + 1
    plansRequestIdRef.current = requestId

    if (!goalId) {
      setFocusPlans([])
      setFocusPlansError(null)
      setFocusPlansLoading(false)
      return
    }

    setFocusPlans([])
    setFocusPlansLoading(true)
    setFocusPlansError(null)

    try {
      const response = await fetch(`/api/plan?goal_id=${encodeURIComponent(goalId)}&pageSize=1000`)
      if (!response.ok) {
        throw new Error(await readApiError(response, "关联计划加载失败"))
      }

      const loadedPlans = parseFocusPlanList(await response.json())
      if (plansRequestIdRef.current !== requestId) {
        return
      }

      setFocusPlans(loadedPlans)
    } catch (loadError) {
      if (plansRequestIdRef.current !== requestId) {
        return
      }

      setFocusPlans([])
      setFocusPlansError(loadError instanceof Error && loadError.message ? loadError.message : "关联计划加载失败")
    } finally {
      if (plansRequestIdRef.current === requestId) {
        setFocusPlansLoading(false)
      }
    }
  }, [])

  const savedPeriods = React.useMemo(() => periods.filter(period => !isDraftPeriod(period)), [periods])
  const currentPeriod = React.useMemo(() => findCurrentFocusPeriod(savedPeriods), [savedPeriods])
  const currentGoalName = currentPeriod ? currentPeriod.goal?.name ?? "目标已删除" : undefined
  const currentGoalTag = currentPeriod?.goal?.tag

  React.useEffect(() => {
    void loadFocusPlans(currentPeriod?.goal_id)
  }, [currentPeriod?.goal_id, loadFocusPlans])

  async function savePeriod(period: FocusPeriodView): Promise<FocusPeriodView> {
    localMutationVersionRef.current += 1
    const isDraft = isDraftPeriod(period)
    const response = await fetch("/api/focus-period", {
      method: isDraft ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(isDraft ? {} : { period_id: period.period_id }),
        year: period.year,
        start_date: period.start_date,
        end_date: period.end_date,
        goal_id: period.goal_id,
        color: period.color,
      }),
    })

    if (!response.ok) {
      throw new Error(await readApiError(response, "保存专注阶段失败"))
    }

    const savedData = await response.json()
    if (!isFocusPeriodView(savedData)) {
      throw new Error("专注阶段保存结果格式无效")
    }

    const savedPeriod = savedData
    setPeriods(currentPeriods => sortPeriods(
      currentPeriods.map(currentPeriodItem =>
        currentPeriodItem.period_id === period.period_id ? savedPeriod : currentPeriodItem,
      ),
    ))

    return savedPeriod
  }

  async function deletePeriod(periodId: string): Promise<void> {
    localMutationVersionRef.current += 1

    if (periodId.startsWith("draft_")) {
      setPeriods(currentPeriods => currentPeriods.filter(period => period.period_id !== periodId))
      return
    }

    const response = await fetch(`/api/focus-period?period_id=${encodeURIComponent(periodId)}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      throw new Error(await readApiError(response, "删除专注阶段失败"))
    }

    setPeriods(currentPeriods => currentPeriods.filter(period => period.period_id !== periodId))
  }

  function addDraft(period: FocusPeriodView) {
    localMutationVersionRef.current += 1
    setPeriods(currentPeriods => sortPeriods([...currentPeriods, period]))
  }

  function openFocusPlan(planId: string) {
    if (!currentPeriod) return

    router.push(`/plans?goal_id=${encodeURIComponent(currentPeriod.goal_id)}&highlight=${encodeURIComponent(planId)}`)
  }

  return (
    <section className="w-full max-w-5xl rounded-lg border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{year} 当前只做这一件事</p>
          <h2 className="mt-2 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
            {loading ? "正在加载专注目标..." : currentGoalName ?? "当前没有设置专注目标"}
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground"
          onClick={() => setDrawerOpen(true)}
        >
          调整
        </Button>
      </div>

      {currentPeriod ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{formatDateRange(currentPeriod)}</span>
          <span
            className="rounded-sm px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: currentPeriod.color }}
          >
            {currentGoalTag ?? "目标已删除"}
          </span>
        </div>
      ) : null}

      {currentPeriod ? (
        <div className="mt-4 rounded-md border bg-muted/20">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40"
            aria-expanded={focusPlansOpen}
            onClick={() => setFocusPlansOpen(open => !open)}
          >
            <span className="font-medium">
              关联计划
              <span className="ml-2 text-muted-foreground">{focusPlansLoading ? "加载中" : `${focusPlans.length} 个`}</span>
            </span>
            {focusPlansOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {focusPlansOpen ? (
            <div className="border-t px-3 py-3">
              {focusPlansError ? (
                <div className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
                  <p>{focusPlansError}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void loadFocusPlans(currentPeriod.goal_id)}>
                    重试
                  </Button>
                </div>
              ) : focusPlansLoading ? (
                <div className="py-5 text-center text-sm text-muted-foreground">加载关联计划...</div>
              ) : focusPlans.length === 0 ? (
                <div className="rounded border border-dashed bg-background py-5 text-center text-sm text-muted-foreground">
                  暂无关联计划
                </div>
              ) : (
                <div className="overflow-x-auto rounded border bg-background">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-[64px_minmax(180px,1fr)_72px_150px_100px] items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <span>步骤</span>
                      <span>计划</span>
                      <span>难度</span>
                      <span>进度</span>
                      <span>最近进展</span>
                    </div>
                    {focusPlans.map((plan, index) => (
                      <button
                        key={plan.plan_id}
                        type="button"
                        className="grid w-full grid-cols-[64px_minmax(180px,1fr)_72px_150px_100px] items-center gap-3 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/40"
                        onClick={() => openFocusPlan(plan.plan_id)}
                      >
                        <span className="whitespace-nowrap font-medium text-muted-foreground">第 {index + 1} 步</span>
                        <span className="min-w-0 truncate font-medium">{plan.name}</span>
                        <span className={cn("inline-flex justify-self-start rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", getPlanDifficultyClass(plan.difficulty))}>
                          {plan.difficulty || "未设置"}
                        </span>
                        <span className="whitespace-nowrap text-muted-foreground">{formatFocusPlanProgress(plan)}</span>
                        <span className="whitespace-nowrap text-muted-foreground">{formatPlanRecentProgress(plan)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadFocusData()}>
            重试
          </Button>
        </div>
      ) : null}

      <div className="mt-6">
        <YearTimeline year={year} periods={savedPeriods} />
      </div>

      <FocusPeriodDrawer
        open={drawerOpen}
        year={year}
        periods={periods}
        goals={goals}
        onClose={() => setDrawerOpen(false)}
        onYearChange={setYear}
        onSave={savePeriod}
        onDelete={deletePeriod}
        onCreateDraft={addDraft}
      />
    </section>
  )
}
