/* @vitest-environment jsdom */

import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let suspendSearchParams = false

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => {
    if (suspendSearchParams) {
      throw new Promise<never>(() => undefined)
    }
    return new URLSearchParams()
  },
}))

vi.mock("@/components/main-layout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/app-page", () => ({
  AppPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock("@/components/ui/wysiwyg-editor", () => ({
  WysiwygEditor: () => null,
}))

vi.mock("@/components/ui/slider", () => ({
  Slider: () => <input aria-label="进度滑块" type="range" />,
}))

vi.mock("@/components/ui/text-preview", () => ({
  TextPreview: ({ text }: { text: string }) => <span>{text}</span>,
}))

import PlansPage from "./page"

const planFixture = {
  id: 1,
  plan_id: "plan_ddia",
  name: "读完 DDIA",
  description: "",
  difficulty: "hard",
  progress: 0,
  goal_id: null,
  goal: null,
  is_recurring: false,
  recurrence_type: null,
  recurrence_value: null,
  tags: [],
  progressRecords: [],
  priority_quadrant: null,
  is_scheduled: false,
  estimated_minutes: 300,
  default_block_minutes: null as number | null,
  has_execution_history: false,
  time_budget: {
    effective_default_block_minutes: 45,
    invested_minutes: 105,
    remaining_minutes: 195,
    reserved_action_minutes: 90,
    unallocated_remaining_minutes: 105,
    scheduled_block_count: 0,
    scheduled_minutes: 0,
    schedulable_minutes: 105,
    suggested_block_minutes: 45,
    budget_status: "ok",
    has_scheduled_direct_block: false,
    actions: {},
  },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function setupFetch(options: {
  plans?: Array<typeof planFixture>
  preference?: unknown
  writeResponse?: Response | ((method: string) => Response)
  rejectRefresh?: boolean
} = {}) {
  const plans = options.plans ?? []
  const preference = options.preference ?? { default_block_minutes: 45 }
  let planReadCount = 0
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"

    if (url.startsWith("/api/plan?") && method === "GET") {
      planReadCount += 1
      if (options.rejectRefresh && planReadCount > 1) {
        throw new Error("refresh unavailable")
      }
      return jsonResponse({ list: plans, total: plans.length })
    }
    if (url === "/api/planning-preference") {
      return jsonResponse(preference)
    }
    if (url.startsWith("/api/tag")) {
      return jsonResponse([])
    }
    if (url.startsWith("/api/goal")) {
      return jsonResponse({ list: [] })
    }
    if (url === "/api/plan" && (method === "POST" || method === "PUT")) {
      if (typeof options.writeResponse === "function") {
        return options.writeResponse(method)
      }
      return options.writeResponse ?? jsonResponse({ ok: true })
    }
    throw new Error(`unexpected fetch: ${method} ${url}`)
  })

  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function findWriteBody(fetchMock: ReturnType<typeof setupFetch>, method: "POST" | "PUT") {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === method)
  expect(call).toBeTruthy()
  return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>
}

async function renderLoadedPage() {
  render(<PlansPage />)
  await waitFor(() => expect(screen.getByRole("heading", { name: "计划管理" })).toBeTruthy())
  await waitFor(() => expect(screen.queryByText("加载中...")).toBeNull())
}

beforeEach(() => {
  suspendSearchParams = false
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("PlansPage", () => {
  it("keeps URL search parameter reads inside a Suspense boundary", () => {
    suspendSearchParams = true
    const html = renderToString(<PlansPage />)

    expect(html).toContain("正在加载计划")
  })

  it("loads the planning preference and displays its inherited block length", async () => {
    setupFetch()

    await renderLoadedPage()

    await waitFor(() => {
      expect((screen.getByLabelText("默认单块时长（分钟）") as HTMLInputElement).value).toBe("45")
    })
    expect(screen.getByText("继承全局默认 45 分钟")).toBeTruthy()
  })

  it("submits an ordinary plan with a numeric default total and inherited block length", async () => {
    const fetchMock = setupFetch()
    await renderLoadedPage()
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "写方案" } })

    fireEvent.click(screen.getByRole("button", { name: "新增" }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true))
    expect(findWriteBody(fetchMock, "POST")).toEqual(expect.objectContaining({
      name: "写方案",
      estimated_minutes: 60,
      default_block_minutes: null,
    }))
  })

  it("submits a recurring plan without a total and with an explicit per-occurrence duration", async () => {
    const fetchMock = setupFetch()
    await renderLoadedPage()
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "每日复盘" } })
    fireEvent.click(screen.getByLabelText("这是一个周期性任务"))
    fireEvent.change(screen.getByLabelText("每次时长（分钟）"), { target: { value: "30" } })

    fireEvent.click(screen.getByRole("button", { name: "新增" }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true))
    expect(findWriteBody(fetchMock, "POST")).toEqual(expect.objectContaining({
      name: "每日复盘",
      is_recurring: true,
      estimated_minutes: null,
      default_block_minutes: 30,
    }))
  })

  it("loads editable budget values and locks recurrence after execution history", async () => {
    setupFetch({ plans: [{ ...planFixture, has_execution_history: true }] })
    await renderLoadedPage()

    fireEvent.click(screen.getByRole("button", { name: "编辑" }))

    expect((screen.getByLabelText("总预计投入（分钟）") as HTMLInputElement).value).toBe("300")
    expect((screen.getByLabelText("默认单块时长（分钟）") as HTMLInputElement).value).toBe("45")
    expect(screen.getByText("已投入 105 分钟")).toBeTruthy()
    expect(screen.getByText("行动项已预留 90 分钟")).toBeTruthy()
    const recurrenceCheckbox = screen.getByLabelText("这是一个周期性任务") as HTMLInputElement
    expect(recurrenceCheckbox.disabled).toBe(true)
    expect(screen.getByText("已有执行记录，不能切换周期类型")).toBeTruthy()
    const recurrenceDescriptionId = recurrenceCheckbox.getAttribute("aria-describedby")
    expect(recurrenceDescriptionId).toBeTruthy()
    expect(document.getElementById(String(recurrenceDescriptionId))?.textContent).toBe("已有执行记录，不能切换周期类型")
  })

  it("keeps a new form open and shows the API error after a failed POST", async () => {
    setupFetch({ writeResponse: jsonResponse({ error: "总预计投入必须是 15 分钟的倍数" }, 400) })
    await renderLoadedPage()
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "失败计划" } })

    fireEvent.click(screen.getByRole("button", { name: "新增" }))

    expect((await screen.findByRole("alert")).textContent).toContain("总预计投入必须是 15 分钟的倍数")
    expect((screen.getByLabelText("名称") as HTMLInputElement).value).toBe("失败计划")
    expect(screen.getByRole("button", { name: "新增" })).toBeTruthy()
  })

  it("keeps editing after a failed PUT and safely displays a text error", async () => {
    setupFetch({
      plans: [planFixture],
      writeResponse: new Response("upstream unavailable", { status: 503 }),
    })
    await renderLoadedPage()
    fireEvent.click(screen.getByRole("button", { name: "编辑" }))
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "修改后名称" } })

    fireEvent.click(screen.getByRole("button", { name: "更新" }))

    expect((await screen.findByRole("alert")).textContent).toContain("upstream unavailable")
    expect((screen.getByLabelText("名称") as HTMLInputElement).value).toBe("修改后名称")
    expect(screen.getByRole("button", { name: "更新" })).toBeTruthy()
  })

  it("uses a strict editable PUT payload without response-only plan fields", async () => {
    const fetchMock = setupFetch({ plans: [planFixture] })
    await renderLoadedPage()
    fireEvent.click(screen.getByRole("button", { name: "编辑" }))

    fireEvent.click(screen.getByRole("button", { name: "更新" }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true))
    const body = findWriteBody(fetchMock, "PUT")
    expect(body).toEqual(expect.objectContaining({
      plan_id: "plan_ddia",
      estimated_minutes: 300,
      default_block_minutes: null,
    }))
    expect(body).not.toHaveProperty("id")
    expect(body).not.toHaveProperty("goal")
    expect(body).not.toHaveProperty("progressRecords")
    expect(body).not.toHaveProperty("has_execution_history")
    expect(body).not.toHaveProperty("time_budget")
  })

  it("does not submit an edit with a blank ordinary total", async () => {
    const fetchMock = setupFetch({ plans: [planFixture] })
    await renderLoadedPage()
    fireEvent.click(screen.getByRole("button", { name: "编辑" }))
    fireEvent.change(screen.getByLabelText("总预计投入（分钟）"), { target: { value: "" } })

    fireEvent.click(screen.getByRole("button", { name: "更新" }))

    expect((await screen.findByRole("alert")).textContent).toContain("请输入总预计投入")
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false)
    expect(screen.getByRole("button", { name: "更新" })).toBeTruthy()
  })

  it("treats a cleared explicit block length as inherited null", async () => {
    const fetchMock = setupFetch({
      plans: [{ ...planFixture, default_block_minutes: 45 }],
    })
    await renderLoadedPage()
    fireEvent.click(screen.getByRole("button", { name: "编辑" }))
    fireEvent.change(screen.getByLabelText("默认单块时长（分钟）"), { target: { value: "" } })

    fireEvent.submit(screen.getByRole("button", { name: "更新" }).closest("form") as HTMLFormElement)

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true))
    expect(findWriteBody(fetchMock, "PUT")).toEqual(expect.objectContaining({
      default_block_minutes: null,
    }))
  })

  it("separates a successful write from a failed list refresh", async () => {
    const fetchMock = setupFetch({ rejectRefresh: true })
    await renderLoadedPage()
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "已保存计划" } })

    fireEvent.click(screen.getByRole("button", { name: "新增" }))

    expect((await screen.findByRole("alert")).textContent).toContain("已保存")
    expect((screen.getByLabelText("名称") as HTMLInputElement).value).toBe("")
    expect(screen.getByRole("button", { name: "新增" })).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
  })
})
