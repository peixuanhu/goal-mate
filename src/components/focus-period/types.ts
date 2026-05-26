export interface FocusGoalSummary {
  goal_id: string
  name: string
  tag: string
  description?: string | null
}

export interface FocusPeriodView {
  period_id: string
  year: number
  start_date: string
  end_date: string
  goal_id: string
  color: string
  goal: FocusGoalSummary | null
}

export interface GoalOption {
  goal_id: string
  name: string
  tag: string
}
