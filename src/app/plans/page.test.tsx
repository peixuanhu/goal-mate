/* @vitest-environment node */

import React from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => {
    throw new Promise<never>(() => undefined)
  },
}))

vi.mock("@/components/ui/wysiwyg-editor", () => ({
  WysiwygEditor: () => null,
}))

import PlansPage from "./page"

describe("PlansPage", () => {
  it("keeps URL search parameter reads inside a Suspense boundary", () => {
    const html = renderToString(<PlansPage />)

    expect(html).toContain("正在加载计划")
  })
})
