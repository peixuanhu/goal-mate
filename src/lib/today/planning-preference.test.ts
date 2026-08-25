import { describe, expect, it } from "vitest"

import {
  getDefaultPlanningPreference,
  normalizePlanningPreference,
  toPlanningPreferenceView,
} from "./planning-preference"

const validPreference = {
  preference_id: "caller-controlled",
  timezone: "Asia/Shanghai",
  day_start_minutes: 8 * 60,
  day_end_minutes: 22 * 60,
  high_energy_start_minutes: 9 * 60,
  high_energy_end_minutes: 11 * 60,
  buffer_minutes: 15,
  default_block_minutes: 60,
  capacity_warning_minutes: 480,
  version: "2026-08-23T10:00:00.000Z",
}

describe("planning preference", () => {
  describe("getDefaultPlanningPreference", () => {
    it("returns the fixed defaults without inventing a best-hour window", () => {
      expect(getDefaultPlanningPreference("Asia/Shanghai")).toEqual({
        preference_id: "default",
        timezone: "Asia/Shanghai",
        day_start_minutes: 0,
        day_end_minutes: 1440,
        high_energy_start_minutes: null,
        high_energy_end_minutes: null,
        buffer_minutes: 15,
        default_block_minutes: 60,
        capacity_warning_minutes: 480,
        version: null,
      })
    })
  })

  describe("normalizePlanningPreference", () => {
    it("normalizes valid fields and enforces the fixed business key", () => {
      expect(normalizePlanningPreference(validPreference)).toEqual({
        ...validPreference,
        preference_id: "default",
      })
    })

    it("accepts a missing high-energy window", () => {
      expect(
        normalizePlanningPreference({
          ...validPreference,
          high_energy_start_minutes: null,
          high_energy_end_minutes: null,
        }),
      ).toMatchObject({
        high_energy_start_minutes: null,
        high_energy_end_minutes: null,
      })
    })

    it.each(["Not/A_Timezone", "", 42, null])("rejects invalid timezone %j", timezone => {
      expect(() => normalizePlanningPreference({ ...validPreference, timezone })).toThrow(
        "timezone must be a valid IANA timezone",
      )
    })

    it.each([
      { day_start_minutes: -1 },
      { day_start_minutes: 500, day_end_minutes: 500 },
      { day_start_minutes: 501, day_end_minutes: 500 },
      { day_end_minutes: 1441 },
      { day_start_minutes: 480.5 },
    ])("rejects invalid planning-day bounds %j", override => {
      expect(() => normalizePlanningPreference({ ...validPreference, ...override })).toThrow(
        "planning day must use integer minutes with 0 <= start < end <= 1440",
      )
    })

    it.each([
      { high_energy_start_minutes: null, high_energy_end_minutes: 660 },
      { high_energy_start_minutes: 540, high_energy_end_minutes: null },
      { high_energy_start_minutes: 479, high_energy_end_minutes: 600 },
      { high_energy_start_minutes: 540, high_energy_end_minutes: 1321 },
      { high_energy_start_minutes: 600, high_energy_end_minutes: 600 },
      { high_energy_start_minutes: 601, high_energy_end_minutes: 600 },
      { high_energy_start_minutes: 540.5, high_energy_end_minutes: 600 },
    ])("rejects invalid high-energy bounds %j", override => {
      expect(() => normalizePlanningPreference({ ...validPreference, ...override })).toThrow(
        "high-energy window must be null or use integer minutes inside the planning day with start < end",
      )
    })

    it.each([-1, 1.5, "15", null])("rejects invalid buffer %j", buffer_minutes => {
      expect(() => normalizePlanningPreference({ ...validPreference, buffer_minutes })).toThrow(
        "buffer_minutes must be a non-negative integer",
      )
    })

    it.each([0, -1, 1.5, "60", null])("rejects invalid default block %j", default_block_minutes => {
      expect(() => normalizePlanningPreference({ ...validPreference, default_block_minutes })).toThrow(
        "default_block_minutes must be a positive integer",
      )
    })

    it("rejects a positive default block that is not aligned to 15-minute increments", () => {
      expect(() => normalizePlanningPreference({
        ...validPreference,
        default_block_minutes: 50,
      })).toThrow("default_block_minutes must use 15-minute increments")
    })

    it.each([0, -1, 1.5, "480", null])("rejects invalid capacity %j", capacity_warning_minutes => {
      expect(() => normalizePlanningPreference({ ...validPreference, capacity_warning_minutes })).toThrow(
        "capacity_warning_minutes must be a positive integer",
      )
    })

    it.each([
      { buffer_minutes: 2_147_483_648 },
      { default_block_minutes: 2_147_483_648 },
      { capacity_warning_minutes: 2_147_483_648 },
    ])("rejects persisted integers above the PostgreSQL Int maximum %j", override => {
      expect(() => normalizePlanningPreference({ ...validPreference, ...override })).toThrow(
        /must be a (non-negative|positive) integer/,
      )
    })
  })

  describe("toPlanningPreferenceView", () => {
    it("maps a persisted row and exposes only the public view", () => {
      const gmtModified = new Date("2026-08-23T10:00:00.000Z")

      expect(
        toPlanningPreferenceView({
          id: 7,
          gmt_create: new Date("2026-08-01T00:00:00.000Z"),
          gmt_modified: gmtModified,
          preference_id: "default",
          timezone: "Asia/Shanghai",
          day_start_minutes: 480,
          day_end_minutes: 1320,
          high_energy_start_minutes: null,
          high_energy_end_minutes: null,
          buffer_minutes: 15,
          default_block_minutes: 60,
          capacity_warning_minutes: 480,
        }),
      ).toEqual({
        preference_id: "default",
        timezone: "Asia/Shanghai",
        day_start_minutes: 480,
        day_end_minutes: 1320,
        high_energy_start_minutes: null,
        high_energy_end_minutes: null,
        buffer_minutes: 15,
        default_block_minutes: 60,
        capacity_warning_minutes: 480,
        version: "2026-08-23T10:00:00.000Z",
      })
    })
  })
})
