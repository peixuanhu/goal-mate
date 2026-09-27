'use client'
import { useCallback, useEffect, useState } from 'react'
import { journalRequest } from '@/lib/journal/client'
import type { JournalMonthView } from '@/lib/journal/types'
export function useJournalMonth(month: string | null) {
  const [data, setData] = useState<JournalMonthView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    window.addEventListener('goal-mate:data-changed', reload); window.addEventListener('focus', reload)
    return () => { window.removeEventListener('goal-mate:data-changed', reload); window.removeEventListener('focus', reload) }
  }, [reload])
  useEffect(() => {
    let current = true
    const controller = new AbortController()
    setLoading(true); setError(null)
    void journalRequest<JournalMonthView>(`/api/journal/month${month ? `?month=${encodeURIComponent(month)}` : ''}`, { signal: controller.signal })
      .then(view => { if (current) setData(view) })
      .catch(error => { if (current && !controller.signal.aborted) setError(error instanceof Error ? error.message : '手账加载失败') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false; controller.abort() }
  }, [month, revision])
  return { data: month === null || data?.month === month ? data : null, error, loading, reload }
}
