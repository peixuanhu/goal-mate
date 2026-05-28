export interface CalendarDay {
  date: string
  day: number
  inMonth: boolean
  disabled: boolean
}

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
