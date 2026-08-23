import { Clock3 } from "lucide-react"

import type { PlanningPreferenceView } from "@/lib/today/types"

interface DayTimelineProps {
  date: string
  preference: PlanningPreferenceView
  loading: boolean
  error: string | null
}

export const MAX_TIMELINE_MARKERS = 26

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function buildTimelineMarkers(dayStartMinutes: number, dayEndMinutes: number): number[] {
  const markers = [dayStartMinutes]
  let cursor = (Math.floor(dayStartMinutes / 60) + 1) * 60

  while (cursor < dayEndMinutes && markers.length < MAX_TIMELINE_MARKERS - 1) {
    markers.push(cursor)
    cursor += 60
  }

  if (markers.at(-1) !== dayEndMinutes) {
    markers.push(dayEndMinutes)
  }

  return markers
}

export function DayTimeline({ date, preference, loading, error }: DayTimelineProps) {
  const markers = buildTimelineMarkers(preference.day_start_minutes, preference.day_end_minutes)
  const durationMinutes = preference.day_end_minutes - preference.day_start_minutes
  const timelineHeight = Math.max(520, Math.round(durationMinutes * 1.1))

  return (
    <section
      aria-labelledby="today-timeline-heading"
      className="flex h-full min-h-[620px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
    >
      <header className="flex min-h-14 items-center justify-between border-b border-gray-100 px-5 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">今日时间线</p>
          <h2 id="today-timeline-heading" className="mt-0.5 text-base font-semibold text-gray-900">
            {date}
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
          <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
          {formatMinutes(preference.day_start_minutes)}–{formatMinutes(preference.day_end_minutes)}
        </span>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto bg-gray-50/40">
        <div className="relative" style={{ minHeight: timelineHeight }}>
          {markers.map((minutes, index) => {
            const top = durationMinutes === 0
              ? 0
              : ((minutes - preference.day_start_minutes) / durationMinutes) * 100

            return (
              <div
                className="absolute inset-x-0 flex items-start"
                key={minutes}
                style={{ top: `${top}%` }}
              >
                <time className="w-16 -translate-y-1/2 pr-3 text-right text-xs tabular-nums text-gray-400">
                  {formatMinutes(minutes)}
                </time>
                <div className={`flex-1 border-t ${index === 0 || index === markers.length - 1 ? "border-gray-200" : "border-dashed border-gray-200/80"}`} />
              </div>
            )
          })}

          <div className="absolute inset-y-8 left-20 right-5 flex items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white/65 px-6 text-center">
            {loading ? (
              <p className="text-sm text-gray-500" role="status">正在读取今天的安排…</p>
            ) : error ? (
              <div className="max-w-sm" role="alert">
                <p className="font-medium text-red-700">时间线加载失败</p>
                <p className="mt-1 text-sm text-red-600">{error}</p>
              </div>
            ) : (
              <div className="max-w-sm">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                  <Clock3 aria-hidden="true" className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-gray-700">把左侧计划或行动项拖到这里安排时间</p>
                <p className="mt-1 text-xs text-gray-400">排程功能将在下一阶段开放</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
