import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const projectRoot = process.cwd()

function readProjectFile(relativePath: string) {
  const filePath = path.join(projectRoot, relativePath)
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : ""
}

describe("read-only Today workspace", () => {
  it("replaces the authenticated dashboard shell without changing its redirect", () => {
    const source = readProjectFile("src/app/page.tsx")

    expect(source).toContain("const authenticated = await isAuthenticated()")
    expect(source).toContain("redirect('/login')")
    expect(source).toContain("<TodayWorkspace />")
    expect(source).not.toContain("<MainLayout")
  })

  it("uses a desktop three-column workspace with the timeline first on mobile", () => {
    const source = readProjectFile("src/components/today/today-workspace.tsx")

    expect(source).toContain("lg:grid-cols-[300px_minmax(0,1fr)_340px]")
    expect(source).toContain("<GoalCandidatePanel")
    expect(source).toContain("<DayTimeline")
    expect(source).toContain("<AiWorkspace")
    expect(source).toMatch(/order-1[^\"]*lg:col-start-2/)
    expect(source).toMatch(/order-2[^\"]*lg:col-start-1/)
    expect(source).toMatch(/order-3[^\"]*lg:col-start-3/)
  })

  it("offers accessible mobile panel toggles and date navigation", () => {
    const source = readProjectFile("src/components/today/today-workspace.tsx")

    expect(source).toContain('aria-label="前一天"')
    expect(source).toContain('aria-label="后一天"')
    expect(source).toContain("回到今天")
    expect(source).toContain('aria-controls="today-candidates"')
    expect(source).toContain('aria-controls="today-ai"')
    expect(source).toContain("显示候选任务")
    expect(source).toContain("显示 AI 工作区")
  })

  it("keeps the timeline visible when a mobile auxiliary panel opens", () => {
    const source = readProjectFile("src/components/today/today-workspace.tsx")
    const timelineComponentIndex = source.indexOf("<DayTimeline")
    const timelineSectionIndex = source.lastIndexOf("<section", timelineComponentIndex)

    expect(timelineComponentIndex).toBeGreaterThanOrEqual(0)
    expect(timelineSectionIndex).toBeGreaterThanOrEqual(0)
    expect(timelineSectionIndex).toBeLessThan(timelineComponentIndex)

    const timelineSection = source.slice(timelineSectionIndex, timelineComponentIndex)

    expect(timelineSection).toMatch(/className=(?:"[^"]*\border-1\b[^"]*"|\{cn\("[^"]*\border-1\b)/)
    expect(timelineSection).not.toMatch(/\b(?:hidden|sm:hidden|md:hidden|max-(?:sm|md|lg):hidden)\b/)
  })

  it("lays out AI check and chat tabs around the chat workspace", () => {
    const source = readProjectFile("src/components/today/ai-workspace.tsx")

    expect(source).toContain('value="check"')
    expect(source).toContain('value="chat"')
    expect(source).toContain("<ChatWrapper />")
    expect(source).toContain("今日检查将在排程阶段启用")
  })

  it("lays out goal, quadrant and inbox candidate tabs", () => {
    const source = readProjectFile("src/components/today/goal-candidate-panel.tsx")

    expect(source).toContain('value="goal-tree"')
    expect(source).toContain('value="quadrant"')
    expect(source).toContain('value="inbox"')
    expect(source).toContain("目标树")
    expect(source).toContain("四象限")
    expect(source).toContain("收集箱")
  })

  it("renders a bounded timeline with the exact empty-state guidance", () => {
    const source = readProjectFile("src/components/today/day-timeline.tsx")

    expect(source).toContain("day_start_minutes")
    expect(source).toContain("day_end_minutes")
    expect(source).toContain("MAX_TIMELINE_MARKERS")
    expect(source).toContain("把左侧计划或行动项拖到这里安排时间")
  })
})
