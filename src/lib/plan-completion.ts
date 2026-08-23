import { isRecurringTaskCompleted, type RecurringPlan } from "./recurring-utils"

export type CompletablePlan = RecurringPlan & {
  progress: number
}

export function isPlanCompleted(plan: CompletablePlan): boolean {
  if (plan.is_recurring) {
    return isRecurringTaskCompleted({
      ...plan,
      progressRecords: plan.progressRecords ?? [],
    })
  }

  return (plan.progress || 0) >= 1
}
