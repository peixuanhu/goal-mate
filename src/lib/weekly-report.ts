export type WeeklyReportSourceRecord = {
  id: number
  plan_id: string
  content: string | null
  thinking: string | null
  gmt_create: Date
  plan: {
    plan_id: string
    name: string
    progress: number
    goal: {
      goal_id: string
      name: string
      tag: string
    } | null
  }
}

export type WeeklyReportSummary = {
  weekStart: string
  weekEnd: string
  stats: {
    progressRecordCount: number
    planCount: number
    goalCount: number
  }
  completedItems: Array<{
    id: number
    plan_id: string
    planName: string
    goal_id: string | null
    goalName: string | null
    goalTag: string | null
    content: string
    thinking: string
    gmt_create: string
  }>
  topGoals: Array<{
    goal_id: string
    goalName: string
    goalTag: string
    progressRecordCount: number
    planCount: number
    averageProgress: number
  }>
  nextWeekSuggestions: Array<{
    plan_id: string
    planName: string
    goalName: string | null
    reason: string
    progress: number
  }>
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function toShanghaiDate(input?: string): Date {
  if (!input) return new Date(Date.now() + SHANGHAI_OFFSET_MS)
  const [year, month, day] = input.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function getShanghaiWeekRange(dateInput?: string) {
  const shanghaiDate = toShanghaiDate(dateInput)
  const day = shanghaiDate.getUTCDay()
  const daysFromMonday = day === 0 ? 6 : day - 1
  const weekStart = new Date(Date.UTC(
    shanghaiDate.getUTCFullYear(),
    shanghaiDate.getUTCMonth(),
    shanghaiDate.getUTCDate() - daysFromMonday,
  ))
  const weekEnd = new Date(Date.UTC(
    weekStart.getUTCFullYear(),
    weekStart.getUTCMonth(),
    weekStart.getUTCDate() + 6,
  ))

  return {
    weekStart,
    weekEnd,
    queryStart: new Date(weekStart.getTime() - SHANGHAI_OFFSET_MS),
    queryEnd: new Date(weekEnd.getTime() + 24 * 60 * 60 * 1000 - 1 - SHANGHAI_OFFSET_MS),
  }
}

export function buildWeeklyReportSummary({
  weekStart,
  weekEnd,
  records,
}: {
  weekStart: string
  weekEnd: string
  records: WeeklyReportSourceRecord[]
}): WeeklyReportSummary {
  const planIds = new Set(records.map(record => record.plan_id))
  const goalIds = new Set(records.map(record => record.plan.goal?.goal_id).filter((value): value is string => Boolean(value)))

  const completedItems = [...records]
    .sort((a, b) => b.gmt_create.getTime() - a.gmt_create.getTime())
    .map(record => ({
      id: record.id,
      plan_id: record.plan_id,
      planName: record.plan.name,
      goal_id: record.plan.goal?.goal_id ?? null,
      goalName: record.plan.goal?.name ?? null,
      goalTag: record.plan.goal?.tag ?? null,
      content: record.content ?? "",
      thinking: record.thinking ?? "",
      gmt_create: record.gmt_create.toISOString(),
    }))

  const goalMap = new Map<string, {
    goal_id: string
    goalName: string
    goalTag: string
    progressRecordCount: number
    planIds: Set<string>
    progressByPlanId: Map<string, number>
  }>()

  for (const record of records) {
    const goal = record.plan.goal
    if (!goal) continue

    const current = goalMap.get(goal.goal_id) ?? {
      goal_id: goal.goal_id,
      goalName: goal.name,
      goalTag: goal.tag,
      progressRecordCount: 0,
      planIds: new Set<string>(),
      progressByPlanId: new Map<string, number>(),
    }
    current.progressRecordCount += 1
    current.planIds.add(record.plan_id)
    current.progressByPlanId.set(record.plan_id, record.plan.progress ?? 0)
    goalMap.set(goal.goal_id, current)
  }

  const topGoals = [...goalMap.values()]
    .map(goal => {
      const progressValues = [...goal.progressByPlanId.values()]
      const averageProgress = progressValues.length
        ? progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length
        : 0

      return {
        goal_id: goal.goal_id,
        goalName: goal.goalName,
        goalTag: goal.goalTag,
        progressRecordCount: goal.progressRecordCount,
        planCount: goal.planIds.size,
        averageProgress: Number(averageProgress.toFixed(2)),
      }
    })
    .sort((a, b) => b.progressRecordCount - a.progressRecordCount || b.averageProgress - a.averageProgress)

  const latestRecordByPlan = new Map<string, WeeklyReportSourceRecord>()
  for (const record of records) {
    const current = latestRecordByPlan.get(record.plan_id)
    if (!current || record.gmt_create > current.gmt_create) {
      latestRecordByPlan.set(record.plan_id, record)
    }
  }

  const nextWeekSuggestions = [...latestRecordByPlan.values()]
    .filter(record => (record.plan.progress ?? 0) < 1)
    .sort((a, b) => (a.plan.progress ?? 0) - (b.plan.progress ?? 0) || b.gmt_create.getTime() - a.gmt_create.getTime())
    .slice(0, 5)
    .map(record => ({
      plan_id: record.plan_id,
      planName: record.plan.name,
      goalName: record.plan.goal?.name ?? null,
      reason: `本周已有推进，当前进度 ${Math.round((record.plan.progress ?? 0) * 100)}%，适合下周继续完成。`,
      progress: record.plan.progress ?? 0,
    }))

  return {
    weekStart,
    weekEnd,
    stats: {
      progressRecordCount: records.length,
      planCount: planIds.size,
      goalCount: goalIds.size,
    },
    completedItems,
    topGoals,
    nextWeekSuggestions,
  }
}

export function renderWeeklyReportMarkdown(summary: WeeklyReportSummary, nextWeekNote: string): string {
  const lines = [
    `# ${summary.weekStart} 至 ${summary.weekEnd} 周回顾`,
    "",
    "## 本周概览",
    "",
    `- 本周记录 ${summary.stats.progressRecordCount} 条进展`,
    `- 推进 ${summary.stats.planCount} 个计划`,
    `- 关联 ${summary.stats.goalCount} 个目标`,
    "",
    "## 本周完成",
    "",
    ...(
      summary.completedItems.length
        ? summary.completedItems.map(item => `- ${item.planName}${item.goalName ? `（${item.goalName}）` : ""}：${item.content || "未填写进展内容"}`)
        : ["- 本周还没有记录进展。"]
    ),
    "",
    "## 推进最多的目标",
    "",
    ...(
      summary.topGoals.length
        ? summary.topGoals.map(goal => `- ${goal.goalName}：${goal.progressRecordCount} 条进展，${goal.planCount} 个计划，平均进度 ${Math.round(goal.averageProgress * 100)}%`)
        : ["- 本周还没有关联目标的进展。"]
    ),
    "",
    "## 下周建议",
    "",
    ...(
      summary.nextWeekSuggestions.length
        ? summary.nextWeekSuggestions.map(item => `- ${item.planName}${item.goalName ? `（${item.goalName}）` : ""}：${item.reason}`)
        : ["- 暂无自动建议。"]
    ),
    "",
    "## 我的下周计划补充",
    "",
    nextWeekNote.trim() || "未填写。",
    "",
  ]

  return lines.join("\n")
}
