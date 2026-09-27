import type { TrackerConfig, TrackerKind } from './types'

export function defaultTrackerConfig(kind: TrackerKind): TrackerConfig {
  return {
    unit: '', source: 'manual', daily_aggregation: kind === 'boolean' ? 'any' : kind === 'quantity' ? 'sum' : 'last',
    encoding: kind === 'boolean' ? 'fill' : kind === 'snapshot' ? 'line' : kind === 'enum' ? 'symbol' : 'number',
    units_per_cell: '1', threshold: null, minimum: null, maximum: null,
    sync_completion: false, active_weekdays: [],
    enum_options: kind === 'enum' ? [
      { id: 'happy', label: '开心', symbol: '☺', color: '#a7c98a' },
      { id: 'calm', label: '平静', symbol: '◡', color: '#a2bac3' },
      { id: 'tired', label: '疲惫', symbol: '−', color: '#cbb3a3' },
    ] : [],
  }
}
