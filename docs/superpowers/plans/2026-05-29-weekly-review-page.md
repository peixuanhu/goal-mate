# Weekly Review Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/reports` review page that shows a real-time weekly summary and saves it to the existing `Report` model with user-supplied next-week notes.

**Architecture:** Add focused weekly-report utilities in `src/lib/weekly-report.ts`, expose them through `GET /api/report/weekly`, and keep `/api/report` as the persistence endpoint. The client page renders the structured summary, generates Markdown for saving, and manages the existing report history list without changing the Prisma schema.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma/PostgreSQL, Vitest, Tailwind CSS, local shadcn-style UI components, lucide-react icons.

---

## File Structure

- Create `src/lib/weekly-report.ts`: pure date, aggregation, suggestion, and Markdown helpers.
- Create `src/lib/weekly-report.test.ts`: unit tests for week boundaries, aggregation, suggestions, and Markdown output.
- Create `src/app/api/report/weekly/route.ts`: server route that loads progress records with plans/goals and returns `WeeklyReportSummary`.
- Create `src/app/reports/page.tsx`: client page for review preview, next-week note entry, save, history list, view, and delete.
- Modify `src/app/page.tsx`: add a home entry card for the new review page.

Do not modify `prisma/schema.prisma`.

---

### Task 1: Weekly Report Utility Tests

**Files:**
- Create: `src/lib/weekly-report.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/weekly-report.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  buildWeeklyReportSummary,
  formatDateOnly,
  getShanghaiWeekRange,
  renderWeeklyReportMarkdown,
  type WeeklyReportSourceRecord,
} from "./weekly-report"

const sourceRecords: WeeklyReportSourceRecord[] = [
  {
    id: 1,
    plan_id: "plan_a",
    content: "完成第一章阅读",
    thinking: "概念更清楚了",
    gmt_create: new Date("2026-05-25T02:00:00.000Z"),
    plan: {
      plan_id: "plan_a",
      name: "读完 CSAPP",
      progress: 0.4,
      goal: { goal_id: "goal_cs", name: "提升计算机基础", tag: "学习" },
    },
  },
  {
    id: 2,
    plan_id: "plan_b",
    content: "完成第二章笔记",
    thinking: "",
    gmt_create: new Date("2026-05-26T03:00:00.000Z"),
    plan: {
      plan_id: "plan_b",
      name: "整理操作系统笔记",
      progress: 0.2,
      goal: { goal_id: "goal_cs", name: "提升计算机基础", tag: "学习" },
    },
  },
  {
    id: 3,
    plan_id: "plan_music",
    content: "听完 3 首众赞歌",
    thinking: "和声连接很有意思",
    gmt_create: new Date("2026-05-27T03:00:00.000Z"),
    plan: {
      plan_id: "plan_music",
      name: "学习巴赫众赞歌",
      progress: 0.8,
      goal: { goal_id: "goal_music", name: "提升音乐理解", tag: "音乐" },
    },
  },
]

describe("weekly-report", () => {
  it("calculates Asia/Shanghai week range for a Friday", () => {
    const range = getShanghaiWeekRange("2026-05-29")

    expect(formatDateOnly(range.weekStart)).toBe("2026-05-25")
    expect(formatDateOnly(range.weekEnd)).toBe("2026-05-31")
    expect(range.queryStart.toISOString()).toBe("2026-05-24T16:00:00.000Z")
    expect(range.queryEnd.toISOString()).toBe("2026-05-31T15:59:59.999Z")
  })

  it("builds empty summary without records", () => {
    const summary = buildWeeklyReportSummary({
      weekStart: "2026-05-25",
      weekEnd: "2026-05-31",
      records: [],
    })

    expect(summary.stats).toEqual({
      progressRecordCount: 0,
      planCount: 0,
      goalCount: 0,
    })
    expect(summary.completedItems).toEqual([])
    expect(summary.topGoals).toEqual([])
    expect(summary.nextWeekSuggestions).toEqual([])
  })

  it("aggregates completed items, goals, and suggestions", () => {
    const summary = buildWeeklyReportSummary({
      weekStart: "2026-05-25",
      weekEnd: "2026-05-31",
      records: sourceRecords,
    })

    expect(summary.stats).toEqual({
      progressRecordCount: 3,
      planCount: 3,
      goalCount: 2,
    })
    expect(summary.completedItems.map(item => item.id)).toEqual([3, 2, 1])
    expect(summary.topGoals.map(goal => goal.goal_id)).toEqual(["goal_cs", "goal_music"])
    expect(summary.topGoals[0]).toMatchObject({
      goalName: "提升计算机基础",
      progressRecordCount: 2,
      planCount: 2,
      averageProgress: 0.3,
    })
    expect(summary.nextWeekSuggestions.map(item => item.plan_id)).toEqual(["plan_b", "plan_a", "plan_music"])
  })

  it("renders markdown with user next-week note", () => {
    const summary = buildWeeklyReportSummary({
      weekStart: "2026-05-25",
      weekEnd: "2026-05-31",
      records: sourceRecords.slice(0, 1),
    })

    const markdown = renderWeeklyReportMarkdown(summary, "下周优先完成第三章。")

    expect(markdown).toContain("# 2026-05-25 至 2026-05-31 周回顾")
    expect(markdown).toContain("本周记录 1 条进展")
    expect(markdown).toContain("完成第一章阅读")
    expect(markdown).toContain("## 我的下周计划补充")
    expect(markdown).toContain("下周优先完成第三章。")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/weekly-report.test.ts
```

Expected: FAIL because `src/lib/weekly-report.ts` does not exist.

---

### Task 2: Weekly Report Utilities

**Files:**
- Create: `src/lib/weekly-report.ts`
- Test: `src/lib/weekly-report.test.ts`

- [ ] **Step 1: Implement weekly-report utilities**

Create `src/lib/weekly-report.ts`:

```ts
export type WeeklyReportSourceRecord = {
  id: number
  plan_id: string
  content: string | null
  thinking: string | null
  gmt_create: Date
  plan: {
    plan_id: string
    name: string
    progress: number
    goal: {
      goal_id: string
      name: string
      tag: string
    } | null
  }
}

export type WeeklyReportSummary = {
  weekStart: string
  weekEnd: string
  stats: {
    progressRecordCount: number
    planCount: number
    goalCount: number
  }
  completedItems: Array<{
    id: number
    plan_id: string
    planName: string
    goal_id: string | null
    goalName: string | null
    goalTag: string | null
    content: string
    thinking: string
    gmt_create: string
  }>
  topGoals: Array<{
    goal_id: string
    goalName: string
    goalTag: string
    progressRecordCount: number
    planCount: number
    averageProgress: number
  }>
  nextWeekSuggestions: Array<{
    plan_id: string
    planName: string
    goalName: string | null
    reason: string
    progress: number
  }>
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function toShanghaiDate(input?: string): Date {
  if (!input) return new Date(Date.now() + SHANGHAI_OFFSET_MS)
  const [year, month, day] = input.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function getShanghaiWeekRange(dateInput?: string) {
  const shanghaiDate = toShanghaiDate(dateInput)
  const day = shanghaiDate.getUTCDay()
  const daysFromMonday = day === 0 ? 6 : day - 1
  const weekStart = new Date(Date.UTC(
    shanghaiDate.getUTCFullYear(),
    shanghaiDate.getUTCMonth(),
    shanghaiDate.getUTCDate() - daysFromMonday,
  ))
  const weekEnd = new Date(Date.UTC(
    weekStart.getUTCFullYear(),
    weekStart.getUTCMonth(),
    weekStart.getUTCDate() + 6,
  ))

  return {
    weekStart,
    weekEnd,
    queryStart: new Date(weekStart.getTime() - SHANGHAI_OFFSET_MS),
    queryEnd: new Date(weekEnd.getTime() + (24 * 60 * 60 * 1000) - 1 - SHANGHAI_OFFSET_MS),
  }
}

export function buildWeeklyReportSummary({
  weekStart,
  weekEnd,
  records,
}: {
  weekStart: string
  weekEnd: string
  records: WeeklyReportSourceRecord[]
}): WeeklyReportSummary {
  const planIds = new Set(records.map(record => record.plan_id))
  const goalIds = new Set(records.map(record => record.plan.goal?.goal_id).filter((value): value is string => Boolean(value)))

  const completedItems = [...records]
    .sort((a, b) => b.gmt_create.getTime() - a.gmt_create.getTime())
    .map(record => ({
      id: record.id,
      plan_id: record.plan_id,
      planName: record.plan.name,
      goal_id: record.plan.goal?.goal_id ?? null,
      goalName: record.plan.goal?.name ?? null,
      goalTag: record.plan.goal?.tag ?? null,
      content: record.content ?? "",
      thinking: record.thinking ?? "",
      gmt_create: record.gmt_create.toISOString(),
    }))

  const goalMap = new Map<string, {
    goal_id: string
    goalName: string
    goalTag: string
    progressRecordCount: number
    planIds: Set<string>
    progressByPlanId: Map<string, number>
  }>()

  for (const record of records) {
    const goal = record.plan.goal
    if (!goal) continue
    const current = goalMap.get(goal.goal_id) ?? {
      goal_id: goal.goal_id,
      goalName: goal.name,
      goalTag: goal.tag,
      progressRecordCount: 0,
      planIds: new Set<string>(),
      progressByPlanId: new Map<string, number>(),
    }
    current.progressRecordCount += 1
    current.planIds.add(record.plan_id)
    current.progressByPlanId.set(record.plan_id, record.plan.progress ?? 0)
    goalMap.set(goal.goal_id, current)
  }

  const topGoals = [...goalMap.values()]
    .map(goal => {
      const progressValues = [...goal.progressByPlanId.values()]
      const averageProgress = progressValues.length
        ? progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length
        : 0

      return {
        goal_id: goal.goal_id,
        goalName: goal.goalName,
        goalTag: goal.goalTag,
        progressRecordCount: goal.progressRecordCount,
        planCount: goal.planIds.size,
        averageProgress: Number(averageProgress.toFixed(2)),
      }
    })
    .sort((a, b) => b.progressRecordCount - a.progressRecordCount || b.averageProgress - a.averageProgress)

  const latestRecordByPlan = new Map<string, WeeklyReportSourceRecord>()
  for (const record of records) {
    const current = latestRecordByPlan.get(record.plan_id)
    if (!current || record.gmt_create > current.gmt_create) {
      latestRecordByPlan.set(record.plan_id, record)
    }
  }

  const nextWeekSuggestions = [...latestRecordByPlan.values()]
    .filter(record => (record.plan.progress ?? 0) < 1)
    .sort((a, b) => (a.plan.progress ?? 0) - (b.plan.progress ?? 0) || b.gmt_create.getTime() - a.gmt_create.getTime())
    .slice(0, 5)
    .map(record => ({
      plan_id: record.plan_id,
      planName: record.plan.name,
      goalName: record.plan.goal?.name ?? null,
      reason: `本周已有推进，当前进度 ${Math.round((record.plan.progress ?? 0) * 100)}%，适合下周继续完成。`,
      progress: record.plan.progress ?? 0,
    }))

  return {
    weekStart,
    weekEnd,
    stats: {
      progressRecordCount: records.length,
      planCount: planIds.size,
      goalCount: goalIds.size,
    },
    completedItems,
    topGoals,
    nextWeekSuggestions,
  }
}

export function renderWeeklyReportMarkdown(summary: WeeklyReportSummary, nextWeekNote: string): string {
  const lines = [
    `# ${summary.weekStart} 至 ${summary.weekEnd} 周回顾`,
    "",
    "## 本周概览",
    "",
    `- 本周记录 ${summary.stats.progressRecordCount} 条进展`,
    `- 推进 ${summary.stats.planCount} 个计划`,
    `- 关联 ${summary.stats.goalCount} 个目标`,
    "",
    "## 本周完成",
    "",
    ...(
      summary.completedItems.length
        ? summary.completedItems.map(item => `- ${item.planName}${item.goalName ? `（${item.goalName}）` : ""}：${item.content || "未填写进展内容"}`)
        : ["- 本周还没有记录进展。"]
    ),
    "",
    "## 推进最多的目标",
    "",
    ...(
      summary.topGoals.length
        ? summary.topGoals.map(goal => `- ${goal.goalName}：${goal.progressRecordCount} 条进展，${goal.planCount} 个计划，平均进度 ${Math.round(goal.averageProgress * 100)}%`)
        : ["- 本周还没有关联目标的进展。"]
    ),
    "",
    "## 下周建议",
    "",
    ...(
      summary.nextWeekSuggestions.length
        ? summary.nextWeekSuggestions.map(item => `- ${item.planName}${item.goalName ? `（${item.goalName}）` : ""}：${item.reason}`)
        : ["- 暂无自动建议。"]
    ),
    "",
    "## 我的下周计划补充",
    "",
    nextWeekNote.trim() || "未填写。",
    "",
  ]

  return lines.join("\n")
}
```

- [ ] **Step 2: Run tests to verify utilities pass**

Run:

```bash
npm test -- src/lib/weekly-report.test.ts
```

Expected: PASS.

---

### Task 3: Weekly Report API

**Files:**
- Create: `src/app/api/report/weekly/route.ts`
- Test manually with dev server or build because the project has no stable integration-test harness for this new route.

- [ ] **Step 1: Add the API route**

Create `src/app/api/report/weekly/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

import {
  buildWeeklyReportSummary,
  formatDateOnly,
  getShanghaiWeekRange,
  type WeeklyReportSourceRecord,
} from "@/lib/weekly-report"

const prisma = new PrismaClient()

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const weekStartParam = searchParams.get("weekStart") || undefined
  const range = getShanghaiWeekRange(weekStartParam)

  const records = await prisma.progressRecord.findMany({
    where: {
      gmt_create: {
        gte: range.queryStart,
        lte: range.queryEnd,
      },
    },
    orderBy: { gmt_create: "desc" },
    include: {
      plan: {
        select: {
          plan_id: true,
          name: true,
          progress: true,
          goal: {
            select: {
              goal_id: true,
              name: true,
              tag: true,
            },
          },
        },
      },
    },
  })

  const summary = buildWeeklyReportSummary({
    weekStart: formatDateOnly(range.weekStart),
    weekEnd: formatDateOnly(range.weekEnd),
    records: records as WeeklyReportSourceRecord[],
  })

  return NextResponse.json(summary)
}
```

- [ ] **Step 2: Run TypeScript/build verification**

Run:

```bash
npm run build
```

Expected: build succeeds or fails only for pre-existing unrelated issues. If it fails because of this route, fix the route before continuing.

---

### Task 4: Reports Page

**Files:**
- Create: `src/app/reports/page.tsx`
- Uses: `src/lib/weekly-report.ts`

- [ ] **Step 1: Add client page**

Create `src/app/reports/page.tsx`:

```tsx
"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CalendarDays, Eye, RefreshCcw, Save, Trash2 } from "lucide-react"

import AuthGuard from "@/components/AuthGuard"
import { MainLayout } from "@/components/main-layout"
import { MarkdownPreview } from "@/components/ui/markdown-preview"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { renderWeeklyReportMarkdown, type WeeklyReportSummary } from "@/lib/weekly-report"

type Report = {
  id: number
  report_id: string
  title: string
  subtitle: string | null
  content: string | null
  gmt_create: string
}

const emptySummary: WeeklyReportSummary = {
  weekStart: "",
  weekEnd: "",
  stats: { progressRecordCount: 0, planCount: 0, goalCount: 0 },
  completedItems: [],
  topGoals: [],
  nextWeekSuggestions: [],
}

export default function ReportsPage() {
  const [summary, setSummary] = useState<WeeklyReportSummary>(emptySummary)
  const [reports, setReports] = useState<Report[]>([])
  const [nextWeekNote, setNextWeekNote] = useState("")
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [loadingReports, setLoadingReports] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const reportMarkdown = useMemo(() => renderWeeklyReportMarkdown(summary, nextWeekNote), [summary, nextWeekNote])

  const fetchWeeklySummary = useCallback(async () => {
    setLoadingSummary(true)
    setError("")
    try {
      const res = await fetch("/api/report/weekly")
      if (!res.ok) throw new Error("获取周报汇总失败")
      setSummary(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取周报汇总失败")
    } finally {
      setLoadingSummary(false)
    }
  }, [])

  const fetchReports = useCallback(async () => {
    setLoadingReports(true)
    try {
      const res = await fetch("/api/report?pageNum=1&pageSize=10")
      if (!res.ok) throw new Error("获取历史报告失败")
      const data = await res.json()
      setReports(data.list || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取历史报告失败")
    } finally {
      setLoadingReports(false)
    }
  }, [])

  useEffect(() => {
    fetchWeeklySummary()
    fetchReports()
  }, [fetchReports, fetchWeeklySummary])

  const handleSave = async () => {
    setSaving(true)
    setError("")
    try {
      const subtitle = `本周记录 ${summary.stats.progressRecordCount} 条进展，推进 ${summary.stats.planCount} 个计划，关联 ${summary.stats.goalCount} 个目标`
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${summary.weekStart} 至 ${summary.weekEnd} 周回顾`,
          subtitle,
          content: reportMarkdown,
        }),
      })
      if (!res.ok) throw new Error("保存周报失败")
      setNextWeekNote("")
      await fetchReports()
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存周报失败")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (reportId: string) => {
    if (!confirm("确定要删除这份报告吗？")) return
    setError("")
    const res = await fetch(`/api/report?report_id=${reportId}`, { method: "DELETE" })
    if (!res.ok) {
      setError("删除报告失败")
      return
    }
    if (selectedReport?.report_id === reportId) setSelectedReport(null)
    await fetchReports()
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 px-3 py-4 sm:space-y-8 sm:px-4 sm:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/">返回首页</Link>
            </Button>
            <Button type="button" variant="outline" onClick={fetchWeeklySummary} disabled={loadingSummary} className="w-full sm:w-auto">
              <RefreshCcw className="mr-2 h-4 w-4" />
              {loadingSummary ? "刷新中..." : "刷新本周回顾"}
            </Button>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">回顾</h1>
            <p className="text-sm text-muted-foreground">自动汇总本周进展，保存前补充你的下周计划。</p>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">进展记录</CardTitle></CardHeader>
              <CardContent className="text-3xl font-bold">{summary.stats.progressRecordCount}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">推进计划</CardTitle></CardHeader>
              <CardContent className="text-3xl font-bold">{summary.stats.planCount}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">关联目标</CardTitle></CardHeader>
              <CardContent className="text-3xl font-bold">{summary.stats.goalCount}</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <CalendarDays className="h-5 w-5" />
                {summary.weekStart && summary.weekEnd ? `${summary.weekStart} 至 ${summary.weekEnd}` : "本周回顾"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <section className="space-y-3">
                <h2 className="text-base font-semibold">本周完成</h2>
                {summary.completedItems.length === 0 ? (
                  <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
                    本周还没有进展记录。可以先去<Link href="/progress" className="mx-1 text-blue-600 hover:underline">记录进展</Link>。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {summary.completedItems.slice(0, 8).map(item => (
                      <div key={item.id} className="rounded-md border p-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="font-medium">{item.planName}</div>
                          <div className="text-xs text-muted-foreground">{new Date(item.gmt_create).toLocaleString()}</div>
                        </div>
                        {item.goalName && <div className="mt-1 text-xs text-muted-foreground">{item.goalName}{item.goalTag ? ` / ${item.goalTag}` : ""}</div>}
                        <MarkdownPreview content={item.content} maxLines={3} showToggle={true} />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <h2 className="text-base font-semibold">推进最多的目标</h2>
                  {summary.topGoals.length === 0 ? (
                    <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">本周还没有关联目标的进展。</div>
                  ) : summary.topGoals.slice(0, 5).map(goal => (
                    <div key={goal.goal_id} className="rounded-md border p-3">
                      <div className="font-medium">{goal.goalName}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {goal.goalTag} / {goal.progressRecordCount} 条进展 / {goal.planCount} 个计划 / 平均进度 {Math.round(goal.averageProgress * 100)}%
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <h2 className="text-base font-semibold">下周建议</h2>
                  {summary.nextWeekSuggestions.length === 0 ? (
                    <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">暂无自动建议。</div>
                  ) : summary.nextWeekSuggestions.map(item => (
                    <div key={item.plan_id} className="rounded-md border p-3">
                      <div className="font-medium">{item.planName}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{item.goalName ? `${item.goalName} / ` : ""}{item.reason}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <Label htmlFor="nextWeekNote">我的下周计划补充</Label>
                <Textarea
                  id="nextWeekNote"
                  value={nextWeekNote}
                  onChange={event => setNextWeekNote(event.target.value)}
                  placeholder="写下你下周最想推进的重点、节奏安排或提醒..."
                  className="min-h-32"
                />
                <Button type="button" onClick={handleSave} disabled={saving || loadingSummary} className="w-full sm:w-auto">
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "保存中..." : "一键保存周报"}
                </Button>
              </section>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg sm:text-xl">历史报告</CardTitle></CardHeader>
            <CardContent>
              <div className="max-w-full overflow-x-auto rounded-lg border">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>标题</TableHead>
                      <TableHead>摘要</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead className="w-[150px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{loadingReports ? "加载中..." : "暂无历史报告"}</TableCell></TableRow>
                    ) : reports.map(report => (
                      <TableRow key={report.report_id}>
                        <TableCell className="font-medium">{report.title}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{report.subtitle || "无摘要"}</TableCell>
                        <TableCell className="text-sm">{new Date(report.gmt_create).toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedReport(report)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button type="button" size="sm" variant="destructive" onClick={() => handleDelete(report.report_id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {selectedReport && (
            <Card>
              <CardHeader><CardTitle className="text-lg sm:text-xl">{selectedReport.title}</CardTitle></CardHeader>
              <CardContent>
                <MarkdownPreview content={selectedReport.content || ""} maxLines={20} showToggle={true} />
              </CardContent>
            </Card>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  )
}
```

- [ ] **Step 2: Run build verification**

Run:

```bash
npm run build
```

Expected: PASS. If TypeScript reports JSX or import errors from `src/app/reports/page.tsx`, fix them before continuing.

---

### Task 5: Home Entry

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add review card to home**

In `src/app/page.tsx`, add a fourth card beside the existing management cards:

```tsx
<Card className="mx-auto w-full max-w-sm sm:mx-0 sm:w-64">
  <CardHeader>
    <CardTitle>回顾</CardTitle>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground mb-4">
      汇总本周完成事项和下周计划
    </p>
    <Button asChild className="w-full mt-2">
      <Link href="/reports">进入回顾</Link>
    </Button>
  </CardContent>
</Card>
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test -- src/lib/weekly-report.test.ts
npm run build
```

Expected: weekly-report tests pass and Next build succeeds.

---

## Self-Review

- Spec coverage: The plan covers real-time weekly preview, save with user next-week note, existing `Report` persistence, no schema change, weekly API, history list, empty states, and tests.
- Placeholder scan: No placeholder steps are present; each task includes exact paths, commands, and implementation content.
- Type consistency: `WeeklyReportSummary`, `WeeklyReportSourceRecord`, `renderWeeklyReportMarkdown`, and `getShanghaiWeekRange` are defined in Task 2 and used consistently by the API and page.
