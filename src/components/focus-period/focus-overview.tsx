"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { findCurrentFocusPeriod } from "@/lib/focus-period-utils"

import { FocusPeriodDrawer } from "./focus-period-drawer"
import type { FocusPeriodView, GoalOption } from "./types"
import { YearTimeline } from "./year-timeline"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isDraftPeriod(period: FocusPeriodView): boolean {
  return period.period_id.startsWith("draft_")
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
    (value.goal === null || value.goal === undefined || isRecord(value.goal))
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
  const [year, setYear] = React.useState(() => new Date().getFullYear())
  const [periods, setPeriods] = React.useState<FocusPeriodView[]>([])
  const [goals, setGoals] = React.useState<GoalOption[]>([])
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const requestIdRef = React.useRef(0)

  const loadFocusData = React.useCallback(async () => {
    const requestId = requestIdRef.current + 1
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

      setPeriods(sortPeriods(loadedPeriods))
      setGoals(loadedGoals)
    } catch (loadError) {
      if (requestIdRef.current !== requestId) {
        return
      }

      setPeriods([])
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

  const savedPeriods = React.useMemo(() => periods.filter(period => !isDraftPeriod(period)), [periods])
  const currentPeriod = React.useMemo(() => findCurrentFocusPeriod(savedPeriods), [savedPeriods])
  const currentGoalName = currentPeriod?.goal?.name
  const currentGoalTag = currentPeriod?.goal?.tag

  async function savePeriod(period: FocusPeriodView): Promise<FocusPeriodView> {
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
    setPeriods(currentPeriods => sortPeriods([...currentPeriods, period]))
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
