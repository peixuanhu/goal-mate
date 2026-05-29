import { describe, expect, it } from "vitest"

import {
  buildWeeklyReportSummary,
  formatDateOnly,
  getShanghaiWeekRange,
  renderWeeklyReportMarkdown,
  type WeeklyReportSourceRecord,
} from "./weekly-report"

const sourceRecords: WeeklyReportSourceRecord[] = [
  {
    id: 1,
    plan_id: "plan_a",
    content: "完成第一章阅读",
    thinking: "概念更清楚了",
    gmt_create: new Date("2026-05-25T02:00:00.000Z"),
    plan: {
      plan_id: "plan_a",
      name: "读完 CSAPP",
      progress: 0.4,
      goal: { goal_id: "goal_cs", name: "提升计算机基础", tag: "学习" },
    },
  },
  {
    id: 2,
    plan_id: "plan_b",
    content: "完成第二章笔记",
    thinking: "",
    gmt_create: new Date("2026-05-26T03:00:00.000Z"),
    plan: {
      plan_id: "plan_b",
      name: "整理操作系统笔记",
      progress: 0.2,
      goal: { goal_id: "goal_cs", name: "提升计算机基础", tag: "学习" },
    },
  },
  {
    id: 3,
    plan_id: "plan_music",
    content: "听完 3 首众赞歌",
    thinking: "和声连接很有意思",
    gmt_create: new Date("2026-05-27T03:00:00.000Z"),
    plan: {
      plan_id: "plan_music",
      name: "学习巴赫众赞歌",
      progress: 0.8,
      goal: { goal_id: "goal_music", name: "提升音乐理解", tag: "音乐" },
    },
  },
]

describe("weekly-report", () => {
  it("calculates Asia/Shanghai week range for a Friday", () => {
    const range = getShanghaiWeekRange("2026-05-29")

    expect(formatDateOnly(range.weekStart)).toBe("2026-05-25")
    expect(formatDateOnly(range.weekEnd)).toBe("2026-05-31")
    expect(range.queryStart.toISOString()).toBe("2026-05-24T16:00:00.000Z")
    expect(range.queryEnd.toISOString()).toBe("2026-05-31T15:59:59.999Z")
  })

  it("builds empty summary without records", () => {
    const summary = buildWeeklyReportSummary({
      weekStart: "2026-05-25",
      weekEnd: "2026-05-31",
      records: [],
    })

    expect(summary.stats).toEqual({
      progressRecordCount: 0,
      planCount: 0,
      goalCount: 0,
    })
    expect(summary.completedItems).toEqual([])
    expect(summary.topGoals).toEqual([])
    expect(summary.nextWeekSuggestions).toEqual([])
  })

  it("aggregates completed items, goals, and suggestions", () => {
    const summary = buildWeeklyReportSummary({
      weekStart: "2026-05-25",
      weekEnd: "2026-05-31",
      records: sourceRecords,
    })

    expect(summary.stats).toEqual({
      progressRecordCount: 3,
      planCount: 3,
      goalCount: 2,
    })
    expect(summary.completedItems.map(item => item.id)).toEqual([3, 2, 1])
    expect(summary.topGoals.map(goal => goal.goal_id)).toEqual(["goal_cs", "goal_music"])
    expect(summary.topGoals[0]).toMatchObject({
      goalName: "提升计算机基础",
      progressRecordCount: 2,
      planCount: 2,
      averageProgress: 0.3,
    })
    expect(summary.nextWeekSuggestions.map(item => item.plan_id)).toEqual(["plan_b", "plan_a", "plan_music"])
  })

  it("renders markdown with user next-week note", () => {
    const summary = buildWeeklyReportSummary({
      weekStart: "2026-05-25",
      weekEnd: "2026-05-31",
      records: sourceRecords.slice(0, 1),
    })

    const markdown = renderWeeklyReportMarkdown(summary, "下周优先完成第三章。")

    expect(markdown).toContain("# 2026-05-25 至 2026-05-31 周回顾")
    expect(markdown).toContain("本周记录 1 条进展")
    expect(markdown).toContain("完成第一章阅读")
    expect(markdown).toContain("## 我的下周计划补充")
    expect(markdown).toContain("下周优先完成第三章。")
  })
})
