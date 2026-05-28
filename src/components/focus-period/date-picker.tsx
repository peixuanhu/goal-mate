"use client"

import * as React from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import {
  buildCalendarMonth,
  formatDateForDisplay,
  formatMonthTitle,
  getMonthIndexFromDate,
} from "./date-picker-utils"

interface DatePickerProps {
  id: string
  value: string
  year: number
  fallbackMonthIndex: number
  onChange: (value: string) => void
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"]

export function DatePicker({ id, value, year, fallbackMonthIndex, onChange }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [monthIndex, setMonthIndex] = React.useState(() => getMonthIndexFromDate(value, fallbackMonthIndex))
  const containerRef = React.useRef<HTMLDivElement>(null)
  const days = React.useMemo(() => buildCalendarMonth(year, monthIndex), [monthIndex, year])

  React.useEffect(() => {
    if (!open) {
      return
    }

    setMonthIndex(getMonthIndexFromDate(value, fallbackMonthIndex))
  }, [fallbackMonthIndex, open, value])

  React.useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [open])

  function selectDate(date: string) {
    onChange(date)
    setOpen(false)
  }

  function previousMonth() {
    setMonthIndex(current => Math.max(0, current - 1))
  }

  function nextMonth() {
    setMonthIndex(current => Math.min(11, current + 1))
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        id={id}
        type="button"
        variant="outline"
        className={cn(
          "h-9 w-full justify-start px-3 text-left font-normal",
          !value && "text-muted-foreground",
        )}
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <CalendarDays className="size-4 text-muted-foreground" />
        <span className="truncate">{value ? formatDateForDisplay(value) : "选择日期"}</span>
      </Button>

      {open ? (
        <div
          className="absolute left-0 z-[60] mt-2 w-72 rounded-md border bg-popover p-3 shadow-lg"
          role="dialog"
          aria-label="选择日期"
        >
          <div className="mb-3 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={previousMonth}
              disabled={monthIndex === 0}
              aria-label="上个月"
              title="上个月"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <p className="text-sm font-medium">{formatMonthTitle(year, monthIndex)}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={nextMonth}
              disabled={monthIndex === 11}
              aria-label="下个月"
              title="下个月"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {WEEKDAYS.map(weekday => (
              <span key={weekday} className="py-1">
                {weekday}
              </span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map(day => {
              const selected = day.date === value

              return (
                <button
                  key={day.date}
                  type="button"
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md text-sm transition-colors",
                    day.inMonth ? "text-foreground" : "text-muted-foreground/60",
                    !day.disabled && "hover:bg-accent hover:text-accent-foreground",
                    selected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                    day.disabled && "cursor-not-allowed opacity-30",
                  )}
                  onClick={() => selectDate(day.date)}
                  disabled={day.disabled}
                  aria-pressed={selected}
                >
                  {day.day}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
