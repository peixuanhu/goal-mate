import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const projectRoot = process.cwd()

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8")
}

describe("table action layout regression", () => {
  it("lets expanded goal routes fill the full table width", () => {
    const source = readProjectFile("src/app/goals/page.tsx")

    expect(source).toContain("colSpan={5}")
    expect(source).not.toContain('aria-hidden="true" className="sticky right-0')
  })

  it("keeps row actions as a single stable button group", () => {
    const source = readProjectFile("src/app/goals/page.tsx")

    expect(source).toContain('<Table className="w-full table-fixed">')
    expect(source).toContain("w-[180px] min-w-[180px]")
    expect(source).not.toContain("sticky right-0")
    expect(source).toContain("inline-flex items-center justify-end gap-2 whitespace-nowrap")
    expect(source).not.toContain("min-w-[980px]")
  })

  it("shows full goal descriptions on hover without the markdown eye toggle", () => {
    const source = readProjectFile("src/app/goals/page.tsx")

    expect(source).not.toContain("MarkdownPreview")
    expect(source).toContain("TextPreview")
    expect(source).toContain("text={goal.description || ''}")
    expect(source).toContain("maxLength={32}")
    expect(source).toContain("overflow-hidden")
  })

  it("shows full plan descriptions on hover without the markdown eye toggle", () => {
    const source = readProjectFile("src/app/plans/page.tsx")

    expect(source).not.toContain("MarkdownPreview")
    expect(source).toContain("text={plan.description || ''}")
    expect(source).toContain("maxLength={80}")
    expect(source).toContain("truncateLines={2}")
  })

  it("uses modern full-description hover cards without nested card chrome", () => {
    const source = readProjectFile("src/components/ui/text-preview.tsx")

    expect(source).not.toContain("Card")
    expect(source).not.toContain("bg-gradient-to-r")
    expect(source).toContain("完整描述")
    expect(source).toContain("max-h-[min(60vh,24rem)]")
    expect(source).toContain("rounded-lg border border-gray-200/80")
  })

  it("removes eye icons from report list actions", () => {
    const source = readProjectFile("src/app/reports/page.tsx")

    expect(source).not.toContain("Eye")
    expect(source).toContain(">查看<")
    expect(source).toContain("text={report.subtitle || \"无摘要\"}")
  })

  it("uses hover previews for progress record list content instead of markdown eye toggles", () => {
    const source = readProjectFile("src/app/progress/page.tsx")

    expect(source).not.toContain("MarkdownPreview")
    expect(source).toContain("text={r.content}")
    expect(source).toContain("text={r.thinking || ''}")
  })

  it("uses hover previews for weekly completed item lists without markdown eye toggles", () => {
    const source = readProjectFile("src/app/reports/page.tsx")

    expect(source).not.toContain("showToggle={true}")
    expect(source).toContain("text={item.content}")
  })

  it("allows route toolbar controls to wrap without overlapping", () => {
    const source = readProjectFile("src/components/goals/goal-plan-list.tsx")

    expect(source).not.toContain("sm:justify-between")
    expect(source).toContain("ml-auto flex max-w-full flex-wrap items-center justify-end gap-2")
    expect(source).toContain("w-[220px] shrink-0")
    expect(source).not.toContain("min-w-[220px] flex-1")
    expect(source).not.toContain("ml-auto shrink-0")
  })

  it("keeps route progress columns wide enough to avoid overlap", () => {
    const source = readProjectFile("src/components/goals/goal-plan-list.tsx")

    expect(source).toContain("grid-cols-[32px_64px_minmax(180px,320px)_72px_150px_100px_72px]")
    expect(source).toContain("justify-start")
    expect(source).not.toContain("minmax(220px,1fr)")
    expect(source).toContain("whitespace-nowrap")
    expect(source).toContain("justify-self-start")
  })

  it("colors route priority badges by difficulty", () => {
    const source = readProjectFile("src/components/goals/goal-plan-list.tsx")

    expect(source).toContain("function getDifficultyClass")
    expect(source).toContain("bg-red-50")
    expect(source).toContain("bg-amber-50")
    expect(source).toContain("bg-emerald-50")
  })

  it("removes an attached plan from the unassigned dropdown immediately", () => {
    const source = readProjectFile("src/components/goals/goal-plan-list.tsx")

    expect(source).toContain("const attachedPlanId = selectedPlanId")
    expect(source).toContain("setUnassignedPlans(current => current.filter(plan => plan.plan_id !== attachedPlanId))")
    expect(source).toContain("setSelectedPlanId(\"\")")
    expect(source).toContain("await loadPlans()")
  })

  it("lets goal route rows detach an associated plan", () => {
    const source = readProjectFile("src/components/goals/goal-plan-list.tsx")

    expect(source).toContain("async function detachPlan(planId: string)")
    expect(source).toContain("body: JSON.stringify({ plan_id: planId, goal_id: null, expected_goal_id: goalId })")
    expect(source).toContain("移除")
    expect(source).toContain("await loadPlans()")
  })

  it("lets users open a route plan from the goal route list", () => {
    const source = readProjectFile("src/components/goals/goal-plan-list.tsx")

    expect(source).toContain("onOpenPlan: (planId: string) => void")
    expect(source).toContain("onClick={() => onOpenPlan(plan.plan_id)}")
    expect(source).toContain("router.push(`/plans?goal_id=${encodeURIComponent(goalId)}&highlight=${encodeURIComponent(planId)}`)")
    expect(source).toContain("打开计划")
  })

  it("keeps plan row actions in a single stable button group", () => {
    const source = readProjectFile("src/app/plans/page.tsx")

    expect(source).not.toContain("max-w-full overflow-x-auto overscroll-x-contain rounded-lg border")
    expect(source).toContain("w-[230px] min-w-[230px]")
    expect(source).toContain("inline-flex items-center justify-end gap-2 whitespace-nowrap")
  })

  it("keeps progress row actions in a single stable button group", () => {
    const source = readProjectFile("src/app/progress/page.tsx")

    expect(source).not.toContain("max-w-full overflow-x-auto overscroll-x-contain rounded-lg border")
    expect(source).toContain("inline-flex items-center justify-end gap-2 whitespace-nowrap")
  })

  it("loads associated plans for the current focus goal from the existing plan API", () => {
    const source = readProjectFile("src/components/focus-period/focus-overview.tsx")

    expect(source).toContain("type FocusPlan = {")
    expect(source).toContain("const [focusPlans, setFocusPlans] = React.useState<FocusPlan[]>([])")
    expect(source).toContain(
      "fetch(`/api/plan?goal_id=${encodeURIComponent(goalId)}&pageSize=1000`)"
    )
    expect(source).toContain("void loadFocusPlans(currentPeriod?.goal_id)")
    expect(source).not.toContain("plans:")
  })

  it("keeps the associated focus plans section collapsed by default", () => {
    const source = readProjectFile("src/components/focus-period/focus-overview.tsx")

    expect(source).toContain("const [focusPlansOpen, setFocusPlansOpen] = React.useState(false)")
    expect(source).toContain("aria-expanded={focusPlansOpen}")
    expect(source).toContain("关联计划")
    expect(source).toContain("focusPlansOpen ?")
    expect(source).toContain("<ChevronDown className=\"h-4 w-4\" />")
  })

  it("renders current focus plans as a read-only goal route table", () => {
    const source = readProjectFile("src/components/focus-period/focus-overview.tsx")

    expect(source).toContain("grid-cols-[64px_minmax(180px,1fr)_72px_150px_100px]")
    expect(source).toContain("第 {index + 1} 步")
    expect(source).toContain("计划")
    expect(source).toContain("难度")
    expect(source).toContain("进度")
    expect(source).toContain("最近进展")
    expect(source).not.toContain("DndContext")
    expect(source).not.toContain("SortableContext")
  })

  it("opens focus plan rows on the plans page with goal and highlight query params", () => {
    const source = readProjectFile("src/components/focus-period/focus-overview.tsx")

    expect(source).toContain("function openFocusPlan(planId: string)")
    expect(source).toContain(
      "router.push(`/plans?goal_id=${encodeURIComponent(currentPeriod.goal_id)}&highlight=${encodeURIComponent(planId)}`)"
    )
    expect(source).toContain("onClick={() => openFocusPlan(plan.plan_id)}")
  })

  it("keeps associated plan loading and errors scoped to the collapsible section", () => {
    const source = readProjectFile("src/components/focus-period/focus-overview.tsx")

    expect(source).toContain(
      "setFocusPlansError(loadError instanceof Error && loadError.message ? loadError.message : \"关联计划加载失败\")"
    )
    expect(source).toContain("加载关联计划...")
    expect(source).toContain("暂无关联计划")
    expect(source).toContain("重试")
    expect(source).toContain("onClick={() => void loadFocusPlans(currentPeriod.goal_id)}")
  })
})
