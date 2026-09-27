import { addDays, parseDateOnly } from '@/lib/focus-period-utils'
import { nextExistingLocalDateStartToUtc } from '@/lib/today/timezone'
import { JournalError } from './types'

export function listMonthDates(month: string): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new JournalError('VALIDATION', '月份必须为 YYYY-MM')
  let date: Date
  try { date = parseDateOnly(`${month}-01`) }
  catch { throw new JournalError('VALIDATION', '月份无效') }
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
  const dates: string[] = []
  for (let day = `${month}-01`; day < next; day = addDays(day, 1)) dates.push(day)
  return dates
}

export function journalMonthRange(month: string, timezone: string) {
  const dates = listMonthDates(month)
  const first = dates[0], last = dates[dates.length - 1]
  return {
    dates, first, last, endDate: addDays(last, 1),
    start: nextExistingLocalDateStartToUtc(addDays(first, -1), timezone),
    endExclusive: nextExistingLocalDateStartToUtc(last, timezone),
  }
}

export function shiftJournalMonth(month: string, offset: number) {
  listMonthDates(month)
  const first = parseDateOnly(`${month}-01`)
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1)).toISOString().slice(0, 7)
}

export function dateOnly(date: string) {
  try { return parseDateOnly(date) }
  catch { throw new JournalError('VALIDATION', '日期必须是有效的 YYYY-MM-DD') }
}
