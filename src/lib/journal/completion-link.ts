export function isJournalCompletion(
  record: { outcome: string | null; counts_toward_recurrence: boolean }, recurring: boolean,
) {
  return record.counts_toward_recurrence && (
    record.outcome === 'completed' || (record.outcome === null && recurring)
  )
}
