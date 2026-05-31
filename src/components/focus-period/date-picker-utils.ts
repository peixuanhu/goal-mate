export interface CalendarDay {
  date: string
  day: number
  inMonth: boolean
  disabled: boolean
}

interface PopoverLayoutOptions {
  triggerBottom: number
  triggerLeft: number
  triggerTop: number
  viewportHeight: number
  viewportWidth: number
  popoverGap?: number
  popoverHeight?: number
  popoverWidth?: number
  viewportMargin?: number
}

export interface PopoverLayout {
  left: number
  maxHeight: number
  top: number
  width: number
}

const DEFAULT_POPOVER_GAP = 8
const DEFAULT_POPOVER_HEIGHT = 322
const DEFAULT_POPOVER_WIDTH = 288
const DEFAULT_VIEWPORT_MARGIN = 16

export function formatDateForDisplay(date: string): string {
  return date ? date.replaceAll("-", "/") : ""
}

export function formatMonthTitle(year: number, monthIndex: number): string {
  return `${year}年${monthIndex + 1}月`
}

export function getMonthIndexFromDate(date: string, fallbackMonthIndex: number): number {
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(date)
  if (!match) {
    return fallbackMonthIndex
  }

  const monthIndex = Number(match[1]) - 1
  return monthIndex >= 0 && monthIndex <= 11 ? monthIndex : fallbackMonthIndex
}

export function formatCalendarDate(year: number, monthIndex: number, day: number): string {
  return [
    String(year).padStart(4, "0"),
    String(monthIndex + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-")
}

export function buildCalendarMonth(year: number, monthIndex: number): CalendarDay[] {
  const firstDay = new Date(year, monthIndex, 1)
  const gridStart = new Date(year, monthIndex, 1 - firstDay.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)

    const cellYear = date.getFullYear()
    const cellMonth = date.getMonth()
    const cellDay = date.getDate()

    return {
      date: formatCalendarDate(cellYear, cellMonth, cellDay),
      day: cellDay,
      inMonth: cellYear === year && cellMonth === monthIndex,
      disabled: cellYear !== year,
    }
  })
}

export function calculatePopoverLayout({
  triggerBottom,
  triggerLeft,
  triggerTop,
  viewportHeight,
  viewportWidth,
  popoverGap = DEFAULT_POPOVER_GAP,
  popoverHeight = DEFAULT_POPOVER_HEIGHT,
  popoverWidth = DEFAULT_POPOVER_WIDTH,
  viewportMargin = DEFAULT_VIEWPORT_MARGIN,
}: PopoverLayoutOptions): PopoverLayout {
  const availableWidth = Math.max(0, viewportWidth - viewportMargin * 2)
  const availableHeight = Math.max(0, viewportHeight - viewportMargin * 2)
  const width = Math.min(popoverWidth, availableWidth)
  const maxHeight = Math.min(popoverHeight, availableHeight)
  const minLeft = viewportMargin
  const maxLeft = Math.max(minLeft, viewportWidth - viewportMargin - width)
  const viewportLeft = Math.min(Math.max(triggerLeft, minLeft), maxLeft)

  const belowTop = triggerBottom + popoverGap
  const aboveTop = triggerTop - popoverGap - maxHeight
  const maxTop = Math.max(viewportMargin, viewportHeight - viewportMargin - maxHeight)
  const viewportTop = belowTop + maxHeight <= viewportHeight - viewportMargin || aboveTop < viewportMargin
    ? Math.min(Math.max(belowTop, viewportMargin), maxTop)
    : aboveTop

  return {
    left: viewportLeft - triggerLeft,
    maxHeight,
    top: viewportTop - triggerTop,
    width,
  }
}
