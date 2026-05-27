import { describe, expect, it } from "vitest"

import { createDraftPeriod } from "./focus-period-drawer"

describe("focus-period-drawer", () => {
  it("creates incomplete drafts so default yearly gaps are not autosaved", () => {
    const draft = createDraftPeriod(2026, [])

    expect(draft).toMatchObject({
      year: 2026,
      start_date: "",
      end_date: "",
      goal_id: "",
    })
  })
})
