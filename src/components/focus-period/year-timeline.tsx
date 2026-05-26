"use client"

import { buildTimelineSegments, dateToYearPercent } from "@/lib/focus-period-utils"

import type { FocusPeriodView } from "./types"

interface YearTimelineProps {
  year: number
  periods: FocusPeriodView[]
  today?: Date
}

function formatMonthDay(date: string): string {
  return date.slice(5).replace("-", "/")
}

function formatDateRange(startDate: string, endDate: string): string {
  return `${formatMonthDay(startDate)} - ${formatMonthDay(endDate)}`
}

function getGoalLabel(period: { goal?: { name: string } | null }): string {
  return period.goal?.name ?? "目标已删除"
}

export function YearTimeline({ year, periods, today = new Date() }: YearTimelineProps) {
  const segments = buildTimelineSegments(periods, year)
  const showTodayMarker = today?.getFullYear() === year
  const todayPercent = showTodayMarker ? dateToYearPercent(today, year) : null
  const sortedPeriods = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date))

  return (
    <div className="space-y-3">
      <div className="relative h-4 overflow-hidden rounded-full bg-muted" aria-label={`${year} 年专注目标时间线`}>
        {segments.map(segment => {
          const dateRange = formatDateRange(segment.start_date, segment.end_date)
          const title = segment.kind === "gap" ? `${dateRange} 未设置目标` : `${getGoalLabel(segment)} ${dateRange}`

          return (
            <div
              key={`${segment.kind}-${segment.start_date}-${segment.end_date}`}
              className="absolute inset-y-0"
              style={{
                left: `${segment.leftPercent}%`,
                width: `${segment.widthPercent}%`,
                backgroundColor: segment.color,
              }}
              title={title}
            />
          )
        })}
        {todayPercent !== null ? (
          <div
            className="absolute inset-y-[-4px] w-0.5 -translate-x-1/2 rounded-full bg-foreground"
            style={{ left: `${todayPercent}%` }}
            title="今天"
          />
        ) : null}
      </div>

      {sortedPeriods.length === 0 ? (
        <p className="text-sm text-muted-foreground">全年未设置专注目标</p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {sortedPeriods.map(period => (
            <div key={period.period_id} className="flex min-w-0 items-center gap-2 text-sm">
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: period.color }}
                aria-hidden="true"
              />
              <span className="truncate">
                {formatDateRange(period.start_date, period.end_date)} · {getGoalLabel(period)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
