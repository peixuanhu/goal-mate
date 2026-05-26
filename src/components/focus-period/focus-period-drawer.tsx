"use client"

import * as React from "react"
import { Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  assignFocusColor,
  buildTimelineSegments,
  getYearStart,
} from "@/lib/focus-period-utils"

import { FocusPeriodEditorRow } from "./focus-period-editor-row"
import type { FocusPeriodView, GoalOption } from "./types"

interface FocusPeriodDrawerProps {
  open: boolean
  year: number
  periods: FocusPeriodView[]
  goals: GoalOption[]
  onClose: () => void
  onYearChange: (year: number) => void
  onSave: (period: FocusPeriodView) => Promise<FocusPeriodView | void> | FocusPeriodView | void
  onDelete: (periodId: string) => Promise<void> | void
  onCreateDraft: (period: FocusPeriodView) => void
}

function isDraftPeriod(period: FocusPeriodView): boolean {
  return period.period_id.startsWith("draft_")
}

function createDraftPeriod(year: number, periods: FocusPeriodView[]): FocusPeriodView {
  const nonDraftPeriods = periods.filter(period => !isDraftPeriod(period))
  const firstGap = buildTimelineSegments(nonDraftPeriods, year).find(segment => segment.kind === "gap")
  const startDate = firstGap?.start_date ?? getYearStart(year)
  const endDate = firstGap?.end_date ?? getYearStart(year)

  return {
    period_id: `draft_${Date.now()}`,
    year,
    start_date: startDate,
    end_date: endDate,
    goal_id: "",
    color: assignFocusColor(periods.length),
    goal: null,
  }
}

export function FocusPeriodDrawer({
  open,
  year,
  periods,
  goals,
  onClose,
  onYearChange,
  onSave,
  onDelete,
  onCreateDraft,
}: FocusPeriodDrawerProps) {
  if (!open) {
    return null
  }

  function handleCreateDraft() {
    onCreateDraft(createDraftPeriod(year, periods))
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="关闭专注阶段抽屉"
      />
      <aside
        className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-lg bg-background shadow-xl md:inset-x-auto md:bottom-0 md:right-0 md:top-0 md:h-full md:max-h-none md:w-[min(34rem,100vw)] md:rounded-none md:border-l"
        role="dialog"
        aria-modal="true"
        aria-labelledby="focus-period-drawer-title"
      >
        <div className="flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="focus-period-drawer-title" className="text-lg font-semibold">
              调整年度阶段
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">每段时间只绑定一个目标</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-end sm:px-6">
          <div className="space-y-2 sm:w-36">
            <Label htmlFor="focus-period-year">年份</Label>
            <Input
              id="focus-period-year"
              type="number"
              inputMode="numeric"
              value={year}
              onChange={event => {
                const nextYear = Number(event.target.value)
                if (Number.isInteger(nextYear)) {
                  onYearChange(nextYear)
                }
              }}
            />
          </div>
          <Button type="button" onClick={handleCreateDraft} className="sm:ml-auto">
            <Plus className="size-4" />
            新增阶段
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {periods.length === 0 ? (
            <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              当前年份还没有专注阶段
            </p>
          ) : (
            <div className="space-y-3">
              {periods.map((period, index) => (
                <FocusPeriodEditorRow
                  key={period.period_id}
                  period={period}
                  goals={goals}
                  index={index}
                  onSave={onSave}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
