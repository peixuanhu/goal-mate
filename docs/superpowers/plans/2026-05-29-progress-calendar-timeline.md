# Progress Calendar Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a list/calendar toggle to `/progress`, with month and week calendar views that mark daily progress using stable per-plan color bars and show selected-day records below the calendar.

**Architecture:** Keep data loading and mutation ownership in `src/app/progress/page.tsx`, move date grouping and color assignment into pure utilities, and render the calendar through a focused client component. The existing table, add/edit form, and delete behavior remain in place; the new calendar consumes the same filtered records as the list view.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest, Tailwind CSS, local UI components, lucide-react icons.

---

## File Structure

- Create `src/lib/progress-calendar-utils.ts`: pure local-date, grouping, filtering, week/month grid, and stable color helpers.
- Create `src/lib/progress-calendar-utils.test.ts`: unit tests for the pure helpers.
- Create `src/components/progress/progress-calendar-view.tsx`: client component for month/week controls, Apple Calendar-style event bars, selected-day detail list, edit/delete actions.
- Create `src/components/progress/progress-calendar-view.test.tsx`: server-render tests for the component markup and selected-day behavior.
- Modify `src/app/progress/page.tsx`: add list/calendar display state, shared front-end filtering, larger record fetch size, and render the new calendar view.

Do not modify `prisma/schema.prisma`.
Do not change `/api/progress_record` in this first version.

---

### Task 1: Progress Calendar Utility Tests

**Files:**
- Create: `src/lib/progress-calendar-utils.test.ts`

- [ ] **Step 1: Write the failing utility tests**

Create `src/lib/progress-calendar-utils.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  assignProgressPlanColor,
  buildCalendarMonth,
  buildCalendarWeek,
  filterProgressRecords,
  getRecordsForDate,
  groupProgressRecordsByDate,
  toLocalDateKey,
  type ProgressCalendarRecord,
} from "./progress-calendar-utils"

const records: ProgressCalendarRecord[] = [
  {
    id: 1,
    plan_id: "plan_music",
    plan_name: "练习吉他",
    content: "音阶练习",
    thinking: "左手更稳定",
    gmt_create: new Date(2026, 4, 29, 23, 30).toISOString(),
  },
  {
    id: 2,
    plan_id: "plan_reading",
    plan_name: "阅读 CSAPP",
    content: "读完第一章",
    thinking: "",
    gmt_create: new Date(2026, 4, 29, 8, 15).toISOString(),
  },
  {
    id: 3,
    plan_id: "plan_music",
    plan_name: "练习吉他",
    content: "复盘节奏",
    thinking: "需要慢练",
    gmt_create: new Date(2026, 4, 30, 9, 0).toISOString(),
  },
]

describe("progress-calendar-utils", () => {
  it("formats Date and ISO inputs as local yyyy-mm-dd keys", () => {
    expect(toLocalDateKey(new Date(2026, 4, 29, 0, 30))).toBe("2026-05-29")
    expect(toLocalDateKey(new Date(2026, 11, 31, 23, 59).toISOString())).toBe("2026-12-31")
  })

  it("builds a Monday-first month grid with leading and trailing days", () => {
    const days = buildCalendarMonth("2026-05-15")

    expect(days).toHaveLength(35)
    expect(days[0]).toMatchObject({ dateKey: "2026-04-27", isCurrentMonth: false })
    expect(days[4]).toMatchObject({ dateKey: "2026-05-01", isCurrentMonth: true, dayOfMonth: 1 })
    expect(days[34]).toMatchObject({ dateKey: "2026-05-31", isCurrentMonth: true, dayOfMonth: 31 })
  })

  it("builds a Monday-to-Sunday week around the anchor date", () => {
    const days = buildCalendarWeek("2026-05-29")

    expect(days.map(day => day.dateKey)).toEqual([
      "2026-05-25",
      "2026-05-26",
      "2026-05-27",
      "2026-05-28",
      "2026-05-29",
      "2026-05-30",
      "2026-05-31",
    ])
  })

  it("groups records by local day and keeps newest records first", () => {
    const grouped = groupProgressRecordsByDate(records)

    expect(grouped.get("2026-05-29")?.map(record => record.id)).toEqual([1, 2])
    expect(grouped.get("2026-05-30")?.map(record => record.id)).toEqual([3])
  })

  it("returns records for a selected date", () => {
    expect(getRecordsForDate(records, "2026-05-29").map(record => record.id)).toEqual([1, 2])
    expect(getRecordsForDate(records, "2026-05-28")).toEqual([])
  })

  it("filters records by selected plan and search query", () => {
    expect(filterProgressRecords(records, { planId: "all", searchQuery: "吉他" }).map(record => record.id)).toEqual([1, 3])
    expect(filterProgressRecords(records, { planId: "plan_reading", searchQuery: "" }).map(record => record.id)).toEqual([2])
    expect(filterProgressRecords(records, { planId: "all", searchQuery: "慢练" }).map(record => record.id)).toEqual([3])
  })

  it("assigns stable colors by plan id", () => {
    expect(assignProgressPlanColor("plan_music")).toBe(assignProgressPlanColor("plan_music"))
    expect(assignProgressPlanColor("plan_music")).toMatch(/^#[0-9a-f]{6}$/)
    expect(new Set(["plan_music", "plan_reading", "plan_health"].map(assignProgressPlanColor)).size).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run utility tests to verify they fail**

Run:

```bash
npm test -- src/lib/progress-calendar-utils.test.ts
```

Expected: FAIL because `src/lib/progress-calendar-utils.ts` does not exist.

- [ ] **Step 3: Commit the failing tests**

Run:

```bash
git add src/lib/progress-calendar-utils.test.ts
git commit -m "test: add progress calendar utility coverage"
```

Expected: commit succeeds with only the new test file.

---

### Task 2: Progress Calendar Utilities

**Files:**
- Create: `src/lib/progress-calendar-utils.ts`
- Test: `src/lib/progress-calendar-utils.test.ts`

- [ ] **Step 1: Implement the utility module**

Create `src/lib/progress-calendar-utils.ts`:

```ts
export type ProgressCalendarRecord = {
  id: number
  plan_id: string
  plan_name?: string
  content?: string | null
  thinking?: string | null
  gmt_create: string
}

export type CalendarDay = {
  dateKey: string
  dayOfMonth: number
  isCurrentMonth: boolean
  isToday: boolean
  weekday: number
  weekdayLabel: string
}

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]

const PLAN_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#4f46e5",
  "#be123c",
  "#0f766e",
  "#7c3aed",
]

export function toLocalDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function createLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function createCalendarDay(date: Date, currentMonthIndex: number): CalendarDay {
  return {
    dateKey: toLocalDateKey(date),
    dayOfMonth: date.getDate(),
    isCurrentMonth: date.getMonth() === currentMonthIndex,
    isToday: toLocalDateKey(date) === toLocalDateKey(new Date()),
    weekday: date.getDay(),
    weekdayLabel: WEEKDAY_LABELS[date.getDay()],
  }
}

export function buildCalendarMonth(anchorDateKey: string): CalendarDay[] {
  const anchor = createLocalDate(anchorDateKey)
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7
  const start = addDays(firstOfMonth, -mondayOffset)
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
  const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7

  return Array.from({ length: totalCells }, (_, index) => createCalendarDay(addDays(start, index), anchor.getMonth()))
}

export function buildCalendarWeek(anchorDateKey: string): CalendarDay[] {
  const anchor = createLocalDate(anchorDateKey)
  const mondayOffset = (anchor.getDay() + 6) % 7
  const start = addDays(anchor, -mondayOffset)

  return Array.from({ length: 7 }, (_, index) => createCalendarDay(addDays(start, index), anchor.getMonth()))
}

export function groupProgressRecordsByDate(records: ProgressCalendarRecord[]): Map<string, ProgressCalendarRecord[]> {
  const grouped = new Map<string, ProgressCalendarRecord[]>()

  for (const record of records) {
    const dateKey = toLocalDateKey(record.gmt_create)
    const dayRecords = grouped.get(dateKey) ?? []
    dayRecords.push(record)
    grouped.set(dateKey, dayRecords)
  }

  for (const [dateKey, dayRecords] of grouped.entries()) {
    grouped.set(
      dateKey,
      [...dayRecords].sort((a, b) => new Date(b.gmt_create).getTime() - new Date(a.gmt_create).getTime()),
    )
  }

  return grouped
}

export function getRecordsForDate(records: ProgressCalendarRecord[], dateKey: string): ProgressCalendarRecord[] {
  return groupProgressRecordsByDate(records).get(dateKey) ?? []
}

export function filterProgressRecords(
  records: ProgressCalendarRecord[],
  filters: { planId: string; searchQuery: string },
): ProgressCalendarRecord[] {
  const normalizedQuery = filters.searchQuery.trim().toLowerCase()

  return records.filter(record => {
    const matchesPlan = filters.planId === "all" || record.plan_id === filters.planId
    if (!matchesPlan) return false

    if (!normalizedQuery) return true

    const searchableText = [
      record.plan_name ?? "",
      record.content ?? "",
      record.thinking ?? "",
    ].join(" ").toLowerCase()

    return searchableText.includes(normalizedQuery)
  })
}

export function assignProgressPlanColor(planId: string): string {
  let hash = 0

  for (let index = 0; index < planId.length; index += 1) {
    hash = Math.imul(31, hash) + planId.charCodeAt(index)
  }

  return PLAN_COLORS[Math.abs(hash) % PLAN_COLORS.length]
}
```

- [ ] **Step 2: Run utility tests to verify they pass**

Run:

```bash
npm test -- src/lib/progress-calendar-utils.test.ts
```

Expected: PASS with all tests in `progress-calendar-utils.test.ts` passing.

- [ ] **Step 3: Commit the utility implementation**

Run:

```bash
git add src/lib/progress-calendar-utils.ts src/lib/progress-calendar-utils.test.ts
git commit -m "feat: add progress calendar utilities"
```

Expected: commit succeeds with utility source and test updates.

---

### Task 3: Progress Calendar Component Tests

**Files:**
- Create: `src/components/progress/progress-calendar-view.test.tsx`

- [ ] **Step 1: Write failing component render tests**

Create `src/components/progress/progress-calendar-view.test.tsx`:

```tsx
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { ProgressCalendarView, type ProgressCalendarPlan } from "./progress-calendar-view"
import type { ProgressCalendarRecord } from "@/lib/progress-calendar-utils"

const plans: ProgressCalendarPlan[] = [
  { plan_id: "plan_music", name: "练习吉他" },
  { plan_id: "plan_reading", name: "阅读 CSAPP" },
]

const records: ProgressCalendarRecord[] = [
  {
    id: 1,
    plan_id: "plan_music",
    plan_name: "练习吉他",
    content: "音阶练习",
    thinking: "左手更稳定",
    gmt_create: new Date(2026, 4, 29, 20, 0).toISOString(),
  },
  {
    id: 2,
    plan_id: "plan_reading",
    plan_name: "阅读 CSAPP",
    content: "读完第一章",
    thinking: "",
    gmt_create: new Date(2026, 4, 29, 8, 0).toISOString(),
  },
  {
    id: 3,
    plan_id: "plan_music",
    plan_name: "练习吉他",
    content: "复盘节奏",
    thinking: "需要慢练",
    gmt_create: new Date(2026, 4, 30, 9, 0).toISOString(),
  },
]

function renderCalendar(overrides: Partial<React.ComponentProps<typeof ProgressCalendarView>> = {}) {
  return renderToStaticMarkup(
    <ProgressCalendarView
      records={records}
      plans={plans}
      loading={false}
      calendarMode="month"
      anchorDate="2026-05-29"
      selectedDate="2026-05-29"
      onCalendarModeChange={vi.fn()}
      onAnchorDateChange={vi.fn()}
      onSelectedDateChange={vi.fn()}
      onEditRecord={vi.fn()}
      onDeleteRecord={vi.fn()}
      {...overrides}
    />,
  )
}

describe("ProgressCalendarView", () => {
  it("renders month controls, weekday headers, event bars, and selected-day records", () => {
    const html = renderCalendar()

    expect(html).toContain("2026 年 5 月")
    expect(html).toContain("周一")
    expect(html).toContain("data-testid=\"progress-event-bar\"")
    expect(html).toContain("5 月 29 日")
    expect(html).toContain("练习吉他")
    expect(html).toContain("音阶练习")
    expect(html).toContain("阅读 CSAPP")
  })

  it("renders the week view with all seven days", () => {
    const html = renderCalendar({ calendarMode: "week" })

    expect(html).toContain("2026-05-25 至 2026-05-31")
    expect(html).toContain("5/25")
    expect(html).toContain("5/31")
    expect(html).toContain("复盘节奏")
  })

  it("renders an empty selected-day state", () => {
    const html = renderCalendar({ selectedDate: "2026-05-28" })

    expect(html).toContain("5 月 28 日")
    expect(html).toContain("这一天还没有进展记录")
  })
})
```

- [ ] **Step 2: Run component tests to verify they fail**

Run:

```bash
npm test -- src/components/progress/progress-calendar-view.test.tsx
```

Expected: FAIL because `src/components/progress/progress-calendar-view.tsx` does not exist.

- [ ] **Step 3: Commit the failing component tests**

Run:

```bash
git add src/components/progress/progress-calendar-view.test.tsx
git commit -m "test: add progress calendar component coverage"
```

Expected: commit succeeds with only the new component test file.

---

### Task 4: Progress Calendar Component

**Files:**
- Create: `src/components/progress/progress-calendar-view.tsx`
- Test: `src/components/progress/progress-calendar-view.test.tsx`

- [ ] **Step 1: Implement the calendar component**

Create `src/components/progress/progress-calendar-view.tsx`:

```tsx
"use client"

import { CalendarDays, ChevronLeft, ChevronRight, ListChecks } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MarkdownPreview } from "@/components/ui/markdown-preview"
import { TextPreview } from "@/components/ui/text-preview"
import {
  assignProgressPlanColor,
  buildCalendarMonth,
  buildCalendarWeek,
  getRecordsForDate,
  groupProgressRecordsByDate,
  toLocalDateKey,
  type CalendarDay,
  type ProgressCalendarRecord,
} from "@/lib/progress-calendar-utils"
import { cn } from "@/lib/utils"

export type ProgressCalendarMode = "month" | "week"

export type ProgressCalendarPlan = {
  plan_id: string
  name: string
}

type ProgressCalendarViewProps = {
  records: ProgressCalendarRecord[]
  plans: ProgressCalendarPlan[]
  loading: boolean
  calendarMode: ProgressCalendarMode
  anchorDate: string
  selectedDate: string
  onCalendarModeChange: (mode: ProgressCalendarMode) => void
  onAnchorDateChange: (dateKey: string) => void
  onSelectedDateChange: (dateKey: string) => void
  onEditRecord: (record: ProgressCalendarRecord) => void
  onDeleteRecord: (id: number) => void
}

function addMonths(dateKey: string, amount: number): string {
  const [year, month, day] = dateKey.split("-").map(Number)
  const date = new Date(year, month - 1 + amount, Math.min(day, 28))
  return toLocalDateKey(date)
}

function addDays(dateKey: string, amount: number): string {
  const [year, month, day] = dateKey.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + amount)
  return toLocalDateKey(date)
}

function formatMonthTitle(anchorDate: string): string {
  const [year, month] = anchorDate.split("-")
  return `${year} 年 ${Number(month)} 月`
}

function formatWeekTitle(days: CalendarDay[]): string {
  return `${days[0].dateKey} 至 ${days[6].dateKey}`
}

function formatSelectedDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-").map(Number)
  return `${month} 月 ${day} 日`
}

function getPlanName(record: ProgressCalendarRecord, plans: ProgressCalendarPlan[]): string {
  return record.plan_name || plans.find(plan => plan.plan_id === record.plan_id)?.name || "未知计划"
}

export function ProgressCalendarView({
  records,
  plans,
  loading,
  calendarMode,
  anchorDate,
  selectedDate,
  onCalendarModeChange,
  onAnchorDateChange,
  onSelectedDateChange,
  onEditRecord,
  onDeleteRecord,
}: ProgressCalendarViewProps) {
  const monthDays = buildCalendarMonth(anchorDate)
  const weekDays = buildCalendarWeek(anchorDate)
  const visibleDays = calendarMode === "month" ? monthDays : weekDays
  const groupedRecords = groupProgressRecordsByDate(records)
  const selectedRecords = getRecordsForDate(records, selectedDate)
  const title = calendarMode === "month" ? formatMonthTitle(anchorDate) : formatWeekTitle(weekDays)

  const movePrevious = () => onAnchorDateChange(calendarMode === "month" ? addMonths(anchorDate, -1) : addDays(anchorDate, -7))
  const moveNext = () => onAnchorDateChange(calendarMode === "month" ? addMonths(anchorDate, 1) : addDays(anchorDate, 7))
  const moveToday = () => {
    const today = toLocalDateKey(new Date())
    onAnchorDateChange(today)
    onSelectedDateChange(today)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-white p-3 dark:bg-gray-950 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div>
            <div className="text-base font-semibold">{title}</div>
            <div className="text-xs text-muted-foreground">按计划颜色标记每天的进展</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-1">
            <Button type="button" size="sm" variant={calendarMode === "month" ? "default" : "ghost"} onClick={() => onCalendarModeChange("month")}>
              月
            </Button>
            <Button type="button" size="sm" variant={calendarMode === "week" ? "default" : "ghost"} onClick={() => onCalendarModeChange("week")}>
              周
            </Button>
          </div>
          <Button type="button" size="icon" variant="outline" onClick={movePrevious} title={calendarMode === "month" ? "上一月" : "上一周"}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={moveToday}>
            今天
          </Button>
          <Button type="button" size="icon" variant="outline" onClick={moveNext} title={calendarMode === "month" ? "下一月" : "下一周"}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">加载日历中...</div>
      ) : calendarMode === "month" ? (
        <div className="rounded-lg border bg-white p-2 dark:bg-gray-950">
          <div className="grid grid-cols-7 border-b pb-2 text-center text-xs font-medium text-muted-foreground">
            {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map(label => (
              <div key={label}>{label}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {visibleDays.map(day => {
              const dayRecords = groupedRecords.get(day.dateKey) ?? []
              return (
                <button
                  key={day.dateKey}
                  type="button"
                  onClick={() => onSelectedDateChange(day.dateKey)}
                  className={cn(
                    "min-h-24 border-b border-r p-1 text-left transition-colors last:border-r-0 hover:bg-blue-50 dark:hover:bg-blue-950 sm:min-h-28 sm:p-2",
                    !day.isCurrentMonth && "bg-muted/30 text-muted-foreground",
                    day.dateKey === selectedDate && "bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950",
                  )}
                >
                  <div className={cn("mb-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium", day.isToday && "bg-blue-600 text-white")}>
                    {day.dayOfMonth}
                  </div>
                  <div className="space-y-1">
                    {dayRecords.slice(0, 3).map(record => (
                      <div
                        key={record.id}
                        data-testid="progress-event-bar"
                        className="h-2 rounded-full"
                        style={{ backgroundColor: assignProgressPlanColor(record.plan_id) }}
                        title={getPlanName(record, plans)}
                      />
                    ))}
                    {dayRecords.length > 3 && <div className="text-[10px] text-muted-foreground">+{dayRecords.length - 3}</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white p-2 dark:bg-gray-950">
          <div className="grid min-w-[760px] grid-cols-7 gap-2">
            {visibleDays.map(day => {
              const dayRecords = groupedRecords.get(day.dateKey) ?? []
              return (
                <button
                  key={day.dateKey}
                  type="button"
                  onClick={() => onSelectedDateChange(day.dateKey)}
                  className={cn(
                    "min-h-56 rounded-md border p-3 text-left transition-colors hover:bg-blue-50 dark:hover:bg-blue-950",
                    day.dateKey === selectedDate && "border-blue-500 bg-blue-50 dark:bg-blue-950",
                  )}
                >
                  <div className="mb-3">
                    <div className="text-xs text-muted-foreground">{day.weekdayLabel}</div>
                    <div className={cn("text-sm font-semibold", day.isToday && "text-blue-600 dark:text-blue-400")}>
                      {day.dateKey.slice(5).replace("-", "/")}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {dayRecords.length === 0 ? (
                      <div className="text-xs text-muted-foreground">暂无记录</div>
                    ) : (
                      dayRecords.map(record => (
                        <div key={record.id} className="rounded-md border-l-4 bg-muted/40 p-2" style={{ borderLeftColor: assignProgressPlanColor(record.plan_id) }}>
                          <div className="text-xs font-medium">
                            <TextPreview text={getPlanName(record, plans)} maxLength={16} truncateLines={1} />
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            <TextPreview text={record.content || "进展记录"} maxLength={24} truncateLines={1} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <section className="rounded-lg border bg-white p-4 dark:bg-gray-950">
        <div className="mb-4 flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h3 className="text-base font-semibold">{formatSelectedDate(selectedDate)} 的进展</h3>
        </div>
        {selectedRecords.length === 0 ? (
          <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">这一天还没有进展记录。</div>
        ) : (
          <div className="space-y-3">
            {selectedRecords.map(record => (
              <article key={record.id} className="rounded-md border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: assignProgressPlanColor(record.plan_id) }} />
                      <div className="font-medium">{getPlanName(record, plans)}</div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{new Date(record.gmt_create).toLocaleString()}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => onEditRecord(record)}>
                      编辑
                    </Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => onDeleteRecord(record.id)}>
                      删除
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">内容</div>
                    <MarkdownPreview content={record.content || ""} maxLines={3} showToggle={true} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">思考</div>
                    <MarkdownPreview content={record.thinking || ""} maxLines={3} showToggle={true} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Run component tests**

Run:

```bash
npm test -- src/components/progress/progress-calendar-view.test.tsx
```

Expected: PASS with all `ProgressCalendarView` tests passing.

- [ ] **Step 3: Run utility and component tests together**

Run:

```bash
npm test -- src/lib/progress-calendar-utils.test.ts src/components/progress/progress-calendar-view.test.tsx
```

Expected: PASS for both test files.

- [ ] **Step 4: Commit the component implementation**

Run:

```bash
git add src/components/progress/progress-calendar-view.tsx src/components/progress/progress-calendar-view.test.tsx
git commit -m "feat: add progress calendar view component"
```

Expected: commit succeeds with component source and test updates.

---

### Task 5: Progress Page Integration

**Files:**
- Modify: `src/app/progress/page.tsx`
- Uses: `src/lib/progress-calendar-utils.ts`
- Uses: `src/components/progress/progress-calendar-view.tsx`

- [ ] **Step 1: Update imports**

Modify the top of `src/app/progress/page.tsx` so the import block includes the new helpers and icons:

```tsx
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { CalendarDays, List } from "lucide-react"
import { ProgressCalendarView, type ProgressCalendarMode } from "@/components/progress/progress-calendar-view"
import { filterProgressRecords, toLocalDateKey, type ProgressCalendarRecord } from "@/lib/progress-calendar-utils"
```

Keep all existing imports that are still used. Remove `useMemo` from the snippet if another import line already includes it.

- [ ] **Step 2: Extend page state**

Inside `ProgressPage`, add these state values next to the existing `viewMode` and `searchQuery` state:

```tsx
const [displayMode, setDisplayMode] = useState<'list' | 'calendar'>('list')
const [calendarMode, setCalendarMode] = useState<ProgressCalendarMode>('month')
const [calendarAnchorDate, setCalendarAnchorDate] = useState(() => toLocalDateKey(new Date()))
const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => toLocalDateKey(new Date()))
```

- [ ] **Step 3: Fetch enough records and stop relying on API search**

In `fetchAllRecords`, replace the `URLSearchParams` construction with:

```tsx
const params = new URLSearchParams({
  pageSize: '1000',
  orderBy: 'gmt_create',
  order: 'desc',
})
```

In `fetchRecords`, replace the `URLSearchParams` construction with:

```tsx
const params = new URLSearchParams({
  plan_id: pid,
  pageSize: '1000',
})
```

This keeps search filtering in the client, because `/api/progress_record` does not currently implement `search`.

- [ ] **Step 4: Add shared filtered records**

After the `useEffect` blocks and before `handleSubmit`, add:

```tsx
const calendarRecords: ProgressCalendarRecord[] = useMemo(
  () => records.map(record => ({
    id: record.id,
    plan_id: record.plan_id,
    plan_name: record.plan_name || plans.find(plan => plan.plan_id === record.plan_id)?.name || '未知计划',
    content: record.content,
    thinking: record.thinking,
    gmt_create: record.gmt_create,
  })),
  [records, plans],
)

const visibleRecords = useMemo(
  () => filterProgressRecords(calendarRecords, { planId, searchQuery }),
  [calendarRecords, planId, searchQuery],
)
```

- [ ] **Step 5: Stop refetching when only search text changes**

Change the records-loading effect dependency list from:

```tsx
}, [planId, plans, searchQuery])
```

to:

```tsx
}, [planId, plans])
```

Search becomes an instant front-end filter for both views.

- [ ] **Step 6: Add list/calendar toggle controls**

In the `CardTitle` action area where “查看所有进展” and “单个计划管理” are rendered, add a second button group below or beside the existing group:

```tsx
<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
  <Button
    size="sm"
    variant={displayMode === 'list' ? 'default' : 'outline'}
    onClick={() => setDisplayMode('list')}
    className="w-full sm:w-auto"
  >
    <List className="mr-2 h-4 w-4" />
    列表
  </Button>
  <Button
    size="sm"
    variant={displayMode === 'calendar' ? 'default' : 'outline'}
    onClick={() => setDisplayMode('calendar')}
    className="w-full sm:w-auto"
  >
    <CalendarDays className="mr-2 h-4 w-4" />
    日历
  </Button>
</div>
```

Keep the existing all/single mode buttons.

- [ ] **Step 7: Render calendar or list from the same filtered records**

Wrap the existing “记录列表标题”, table, and statistics block with:

```tsx
{displayMode === 'calendar' ? (
  <ProgressCalendarView
    records={visibleRecords}
    plans={plans}
    loading={loading}
    calendarMode={calendarMode}
    anchorDate={calendarAnchorDate}
    selectedDate={selectedCalendarDate}
    onCalendarModeChange={setCalendarMode}
    onAnchorDateChange={setCalendarAnchorDate}
    onSelectedDateChange={setSelectedCalendarDate}
    onEditRecord={handleEdit}
    onDeleteRecord={handleDelete}
  />
) : (
  <>
    {/* existing list title, table, and statistics block go here */}
  </>
)}
```

Inside the existing table body, change the render source from:

```tsx
records.map(r => (
```

to:

```tsx
visibleRecords.map(r => (
```

Change empty-state checks from `records.length === 0` to `visibleRecords.length === 0`.
Change the statistics block from `records.length > 0` and `共 {records.length} 条进展记录` to `visibleRecords.length > 0` and `共 {visibleRecords.length} 条进展记录`.

- [ ] **Step 8: Fix type compatibility for edit calls**

If TypeScript complains that `ProgressCalendarRecord` is not assignable to the local `ProgressRecord`, update `handleEdit` to accept the shared shape:

```tsx
const handleEdit = (record: ProgressRecord | ProgressCalendarRecord) => {
```

The existing function body can remain unchanged because it uses fields present in both shapes.

- [ ] **Step 9: Run targeted tests**

Run:

```bash
npm test -- src/lib/progress-calendar-utils.test.ts src/components/progress/progress-calendar-view.test.tsx
```

Expected: PASS for both test files.

- [ ] **Step 10: Commit the page integration**

Run:

```bash
git add src/app/progress/page.tsx
git commit -m "feat: integrate progress calendar view"
```

Expected: commit succeeds with only the progress page integration.

---

### Task 6: Final Verification

**Files:**
- Verify: `src/lib/progress-calendar-utils.ts`
- Verify: `src/components/progress/progress-calendar-view.tsx`
- Verify: `src/app/progress/page.tsx`

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS for all Vitest test files.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: exit code 0. If the script fails because `next lint` is unavailable in this Next.js version, record the exact failure and continue to the build.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: exit code 0 and a successful Next.js build.

- [ ] **Step 4: Start the local dev server**

Run:

```bash
npm run dev
```

Expected: dev server starts on `http://localhost:3000` or the next available port.

- [ ] **Step 5: Browser-check `/progress`**

Open `/progress` in the browser and verify:

- The default list view still shows the existing table.
- “列表 / 日历” toggles without losing selected plan or search text.
- Month view shows a 7-column grid and per-plan color bars.
- Week view shows seven days and longer record cards.
- Clicking a date updates the “当天进展” section.
- Edit from the selected-day section opens the existing edit form.
- Delete from the selected-day section uses the existing confirmation and refreshes records.
- Search filters both list and calendar.
- Single-plan mode filters both list and calendar to the selected plan.
- Mobile width has no overlapping text or broken controls.

- [ ] **Step 6: Stop the dev server**

Stop the running dev server with `Ctrl-C`.

- [ ] **Step 7: Commit verification-only fixes if needed**

If verification required small fixes, commit them:

```bash
git add src/lib/progress-calendar-utils.ts src/lib/progress-calendar-utils.test.ts src/components/progress/progress-calendar-view.tsx src/components/progress/progress-calendar-view.test.tsx src/app/progress/page.tsx
git commit -m "fix: polish progress calendar verification issues"
```

Expected: commit only if there are verification fixes.

---

## Self-Review

- Spec coverage: The plan covers list/calendar switching, month/week calendar modes, per-plan stable color bars, selected-day records below the calendar, existing edit/delete reuse, current plan/search filtering, utility tests, build/lint/test verification, and browser QA.
- Completeness scan: No unresolved markers, copy-forward shortcuts, or unspecified implementation steps remain.
- Type consistency: `ProgressCalendarRecord`, `ProgressCalendarPlan`, `ProgressCalendarMode`, `CalendarDay`, and helper names are defined before use and referenced consistently.
- Scope check: The plan does not change database schema or progress-record API behavior; search is deliberately handled in the page layer for this first version.
