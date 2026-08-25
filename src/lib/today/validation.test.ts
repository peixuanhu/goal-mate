import { describe, expect, it } from "vitest"

import { parseActionItemInput, parseDateKey, parsePlanningFields } from "./validation"

function captureError(callback: () => unknown): Error {
  try {
    callback()
  } catch (error) {
    if (error instanceof Error) {
      return error
    }
    throw error
  }

  throw new Error("expected callback to throw")
}

describe("today validation", () => {
  describe("parseDateKey", () => {
    it("accepts a valid date key", () => {
      expect(parseDateKey("2026-08-23")).toBe("2026-08-23")
    })

    it("uses a stable message for a missing date", () => {
      expect(captureError(() => parseDateKey(null)).message).toBe("date required")
    })

    it.each(["2026-02-30", "23-08-2026", "2026-8-23", "", undefined, 20260823, false])(
      "uses a stable message for invalid date value %j",
      value => {
        expect(captureError(() => parseDateKey(value)).message).toBe("date must be a valid yyyy-mm-dd value")
      },
    )
  })

  describe("parsePlanningFields", () => {
    it("sanitizes valid planning fields", () => {
      expect(
        parsePlanningFields({
          due_date: "2026-08-23",
          estimated_minutes: 45,
          energy_level: "high",
          priority_quadrant: "q2",
        }),
      ).toEqual({
        due_date: new Date("2026-08-23T00:00:00.000Z"),
        estimated_minutes: 45,
        energy_level: "high",
        priority_quadrant: "q2",
      })
    })

    it("accepts every supported energy and quadrant value", () => {
      for (const energy_level of ["low", "medium", "high"] as const) {
        expect(parsePlanningFields({ energy_level })).toEqual({ energy_level })
      }

      for (const priority_quadrant of ["q1", "q2", "q3", "q4"] as const) {
        expect(parsePlanningFields({ priority_quadrant })).toEqual({ priority_quadrant })
      }
    })

    it.each([null, ""])("supports clearing every optional planning field with %j", clearValue => {
      expect(
        parsePlanningFields({
          due_date: clearValue,
          estimated_minutes: clearValue,
          energy_level: clearValue,
          priority_quadrant: clearValue,
        }),
      ).toEqual({
        due_date: null,
        estimated_minutes: null,
        energy_level: null,
        priority_quadrant: null,
      })
    })

    it.each([0, -15, 1.5, "30", false])("rejects invalid estimate %j", estimated_minutes => {
      expect(() => parsePlanningFields({ estimated_minutes })).toThrow(
        "estimated_minutes must be a positive integer or null",
      )
    })

    it("rejects estimates outside the PostgreSQL Int range", () => {
      expect(() => parsePlanningFields({ estimated_minutes: 2_147_483_648 })).toThrow(
        "estimated_minutes must be a positive PostgreSQL Int or null",
      )
    })

    it("accepts aligned estimates and rejects unaligned estimates", () => {
      expect(parsePlanningFields({ estimated_minutes: 45 })).toEqual({ estimated_minutes: 45 })
      expect(() => parsePlanningFields({ estimated_minutes: 50 })).toThrow(
        "estimated_minutes must use 15-minute increments",
      )
      expect(parsePlanningFields({ estimated_minutes: null })).toEqual({ estimated_minutes: null })
    })

    it("rejects rollover dates", () => {
      expect(() => parsePlanningFields({ due_date: "2026-02-30" })).toThrow(
        "due_date must be a valid yyyy-mm-dd value or null",
      )
    })

    it("rejects unsupported energy levels", () => {
      expect(() => parsePlanningFields({ energy_level: "urgent" })).toThrow(
        "energy_level must be low, medium, high, or null",
      )
    })

    it("rejects unsupported quadrants", () => {
      expect(() => parsePlanningFields({ priority_quadrant: "q5" })).toThrow(
        "priority_quadrant must be q1, q2, q3, q4, or null",
      )
    })

    it("only returns planning keys that were supplied", () => {
      expect(parsePlanningFields({ estimated_minutes: 30, ignored: true })).toEqual({
        estimated_minutes: 30,
      })
    })

    it.each([[], new Date(), new (class PlanningFieldsInput {})()])(
      "rejects non-plain input %j",
      input => {
        expect(captureError(() => parsePlanningFields(input)).message).toBe(
          "planning fields must be a plain object",
        )
      },
    )
  })

  describe("parseActionItemInput", () => {
    it("trims text and carries validated planning fields", () => {
      expect(
        parseActionItemInput({
          name: "  Draft outline  ",
          description: "  Include examples.  ",
          due_date: "2026-08-23",
          estimated_minutes: 60,
          energy_level: "medium",
          priority_quadrant: "q1",
        }),
      ).toEqual({
        name: "Draft outline",
        description: "Include examples.",
        due_date: new Date("2026-08-23T00:00:00.000Z"),
        estimated_minutes: 60,
        energy_level: "medium",
        priority_quadrant: "q1",
      })
    })

    it.each([{}, { name: "   " }, { name: null }, { name: 42 }])(
      "requires a non-empty string name for %j",
      input => {
        expect(() => parseActionItemInput(input)).toThrow("name required")
      },
    )

    it.each([null, [], "item", new Date()])("requires a plain JSON object for %j", input => {
      expect(() => parseActionItemInput(input)).toThrow("action item input must be a plain object")
    })

    it("accepts null optional fields", () => {
      expect(
        parseActionItemInput({
          name: "Task",
          description: null,
          priority_quadrant: null,
        }),
      ).toEqual({ name: "Task", description: null, priority_quadrant: null })
    })

    it.each(["q0", "Q1", 1, false])("rejects invalid quadrant %j", priority_quadrant => {
      expect(() => parseActionItemInput({ name: "Task", priority_quadrant })).toThrow(
        "priority_quadrant must be q1, q2, q3, q4, or null",
      )
    })
  })
})
