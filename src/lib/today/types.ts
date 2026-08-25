import type { TimeBudgetStatus } from "./time-budget"

export type EnergyLevel = "low" | "medium" | "high"
export type QuadrantId = "q1" | "q2" | "q3" | "q4"
export type ScheduleBlockStatus = "scheduled" | "completed" | "partial" | "skipped" | "cancelled"
export type ScheduleBlockSource = "manual" | "ai_check" | "ai_chat"
export type CandidateKind = "plan" | "action"

export type PlanningPreferenceView = {
  preference_id: "default"
  timezone: string
  day_start_minutes: number
  day_end_minutes: number
  high_energy_start_minutes: number | null
  high_energy_end_minutes: number | null
  buffer_minutes: number
  default_block_minutes: number
  capacity_warning_minutes: number
  version: string | null
}

export type ScheduleBlockView = {
  block_id: string
  plan_id: string
  action_id: string | null
  title: string
  goal_id: string | null
  goal_name: string | null
  energy_level: EnergyLevel | null
  start_at: string
  end_at: string
  status: ScheduleBlockStatus
  source: ScheduleBlockSource
  result_note: string | null
  version: number
}

export type SchedulableCandidate = {
  kind: CandidateKind
  id: string
  plan_id: string
  action_id: string | null
  goal_id: string | null
  goal_name: string | null
  name: string
  due_date: string | null
  estimated_minutes: number | null
  effective_default_block_minutes: number
  invested_minutes: number
  remaining_minutes: number | null
  reserved_action_minutes: number
  available_minutes: number | null
  suggested_block_minutes: number | null
  budget_status: TimeBudgetStatus
  can_schedule: boolean
  schedule_reason: string | null
  energy_level: EnergyLevel | null
  effective_quadrant: QuadrantId | null
  is_recurring: boolean
  version: string
}

export type TodayView = {
  date: string
  preference: PlanningPreferenceView
  focus: { goal_id: string; name: string; tag: string; color: string; version: string } | null
  candidates: SchedulableCandidate[]
  blocks: ScheduleBlockView[]
  checks: []
}
