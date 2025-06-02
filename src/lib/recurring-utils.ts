export enum RecurrenceType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly'
}

export interface RecurringPlan {
  is_recurring: boolean
  recurrence_type?: string
  recurrence_value?: string
  progressRecords: Array<{
    gmt_create: Date
  }>
}

/**
 * 获取当前周期的开始时间
 */
export function getCurrentPeriodStart(recurrenceType: RecurrenceType): Date {
  const now = new Date()
  
  switch (recurrenceType) {
    case RecurrenceType.DAILY:
      // 每日任务：今天00:00:00开始
      return new Date(now.getFullYear(), now.getMonth(), now.getDate())
      
    case RecurrenceType.WEEKLY:
      // 每周任务：本周一00:00:00开始
      const currentDay = now.getDay()
      const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay
      const mondayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset)
      return mondayDate
      
    case RecurrenceType.MONTHLY:
      // 每月任务：本月1号00:00:00开始
      return new Date(now.getFullYear(), now.getMonth(), 1)
      
    default:
      return new Date(0) // 返回一个很早的时间，确保所有记录都被包含
  }
}

/**
 * 获取当前周期的结束时间
 */
export function getCurrentPeriodEnd(recurrenceType: RecurrenceType): Date {
  const now = new Date()
  
  switch (recurrenceType) {
    case RecurrenceType.DAILY:
      // 每日任务：今天23:59:59结束
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, -1)
      
    case RecurrenceType.WEEKLY:
      // 每周任务：本周日23:59:59结束
      const currentDay = now.getDay()
      const sundayOffset = currentDay === 0 ? 0 : 7 - currentDay
      const sundayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + sundayOffset + 1, 0, 0, 0, -1)
      return sundayDate
      
    case RecurrenceType.MONTHLY:
      // 每月任务：本月最后一天23:59:59结束
      return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, -1)
      
    default:
      return new Date() // 返回当前时间
  }
}

/**
 * 获取当前周期内的进展记录次数
 */
export function getCurrentPeriodCount(plan: RecurringPlan): number {
  if (!plan.is_recurring || !plan.recurrence_type) {
    return 0
  }
  
  const recurrenceType = plan.recurrence_type as RecurrenceType
  const periodStart = getCurrentPeriodStart(recurrenceType)
  const periodEnd = getCurrentPeriodEnd(recurrenceType)
  
  return plan.progressRecords.filter(record => {
    const recordDate = new Date(record.gmt_create)
    return recordDate >= periodStart && recordDate <= periodEnd
  }).length
}

/**
 * 获取目标次数
 */
export function getTargetCount(plan: RecurringPlan): number {
  if (!plan.is_recurring) {
    return 1
  }
  
  // 如果有明确设置的值，使用该值
  if (plan.recurrence_value && plan.recurrence_value !== 'null') {
    return parseInt(plan.recurrence_value) || 1
  }
  
  // 根据任务类型和名称推测合理的默认值
  const recurrenceType = plan.recurrence_type as RecurrenceType
  const planName = (plan as any).name?.toLowerCase() || ''
  
  // 根据计划名称智能推测目标次数
  if (planName.includes('2-3次') || planName.includes('2～3次')) {
    return 3 // 每周2-3次，取上限
  }
  
  if (planName.includes('一次') || planName.includes('1次')) {
    return 1
  }
  
  if (planName.includes('三次') || planName.includes('3次')) {
    return 3
  }
  
  if (planName.includes('两次') || planName.includes('2次')) {
    return 2
  }
  
  // 根据周期类型设置默认值
  switch (recurrenceType) {
    case RecurrenceType.DAILY:
      return 1 // 每日任务默认1次
    case RecurrenceType.WEEKLY:
      return 1 // 每周任务默认1次  
    case RecurrenceType.MONTHLY:
      return 1 // 每月任务默认1次
    default:
      return 1
  }
}

/**
 * 判断周期性任务在当前周期内是否已完成
 */
export function isRecurringTaskCompleted(plan: RecurringPlan): boolean {
  if (!plan.is_recurring || !plan.recurrence_type) {
    return false
  }
  
  const currentCount = getCurrentPeriodCount(plan)
  const targetCount = getTargetCount(plan)
  
  return currentCount >= targetCount
}

/**
 * 获取周期性任务的详细状态信息
 */
export function getRecurringTaskDetails(plan: RecurringPlan) {
  if (!plan.is_recurring) {
    return null
  }
  
  const currentCount = getCurrentPeriodCount(plan)
  const targetCount = getTargetCount(plan)
  const isCompleted = currentCount >= targetCount
  const recurrenceType = plan.recurrence_type as RecurrenceType
  
  let periodDesc = ''
  switch (recurrenceType) {
    case RecurrenceType.DAILY:
      periodDesc = '今日'
      break
    case RecurrenceType.WEEKLY:
      periodDesc = '本周'
      break
    case RecurrenceType.MONTHLY:
      periodDesc = '本月'
      break
    default:
      periodDesc = '当期'
  }
  
  return {
    currentCount,
    targetCount,
    isCompleted,
    periodDesc,
    completionRate: Math.min(currentCount / targetCount, 1),
    progressText: `${currentCount}/${targetCount}`,
    statusText: isCompleted ? `${periodDesc}已完成 ✓` : `${periodDesc}未完成`
  }
}

/**
 * 获取周期性任务的状态描述
 */
export function getRecurringTaskStatus(plan: RecurringPlan): string {
  if (!plan.is_recurring) {
    return `进度: ${Math.round(((plan as RecurringPlan & { progress: number }).progress) * 100)}%`
  }
  
  const details = getRecurringTaskDetails(plan)
  if (!details) {
    return '未知状态'
  }
  
  return `${details.progressText} ${details.statusText}`
}

/**
 * 获取周期类型的显示名称
 */
export function getRecurrenceTypeDisplay(recurrenceType: string): string {
  switch (recurrenceType) {
    case RecurrenceType.DAILY:
      return '每日'
    case RecurrenceType.WEEKLY:
      return '每周'
    case RecurrenceType.MONTHLY:
      return '每月'
    default:
      return '未知'
  }
} 