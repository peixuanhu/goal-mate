"use client"

import * as React from "react"
import { Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  assignFocusColor,
  buildTimelineSegments,
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

const MIN_YEAR = 2000
const MAX_YEAR = 2100
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

function isDraftPeriod(period: FocusPeriodView): boolean {
  return period.period_id.startsWith("draft_")
}

function findFirstAvailableGap(year: number, periods: FocusPeriodView[]) {
  const nonDraftPeriods = periods.filter(period => !isDraftPeriod(period))
  return buildTimelineSegments(nonDraftPeriods, year).find(segment => segment.kind === "gap")
}

function createDraftPeriod(year: number, periods: FocusPeriodView[]): FocusPeriodView | null {
  const firstGap = findFirstAvailableGap(year, periods)
  if (!firstGap) {
    return null
  }

  return {
    period_id: `draft_${Date.now()}`,
    year,
    start_date: firstGap.start_date,
    end_date: firstGap.end_date,
    goal_id: "",
    color: assignFocusColor(periods.length),
    goal: null,
  }
}

function isValidYear(value: string): boolean {
  if (!/^\d+$/.test(value)) {
    return false
  }

  const year = Number(value)
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR
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
  const [yearInput, setYearInput] = React.useState(String(year))
  const [draftError, setDraftError] = React.useState<string | null>(null)
  const closeButtonRef = React.useRef<HTMLButtonElement>(null)
  const drawerRef = React.useRef<HTMLElement>(null)
  const firstGap = React.useMemo(() => findFirstAvailableGap(year, periods), [periods, year])
  const hasAvailableGap = Boolean(firstGap)

  React.useEffect(() => {
    setYearInput(String(year))
  }, [year])

  React.useEffect(() => {
    if (!open) {
      return
    }

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus()
    }, 0)

    return () => window.clearTimeout(focusTimer)
  }, [open])

  React.useEffect(() => {
    if (hasAvailableGap) {
      setDraftError(null)
    }
  }, [hasAvailableGap])

  if (!open) {
    return null
  }

  function handleCreateDraft() {
    const draftPeriod = createDraftPeriod(year, periods)
    if (!draftPeriod) {
      setDraftError("当前年份没有可用空白时间段")
      return
    }

    setDraftError(null)
    onCreateDraft(draftPeriod)
  }

  function handleYearChange(value: string) {
    setYearInput(value)
    setDraftError(null)

    if (value === "") {
      return
    }

    if (isValidYear(value)) {
      onYearChange(Number(value))
    }
  }

  function handleYearBlur() {
    if (!isValidYear(yearInput)) {
      setYearInput(String(year))
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key !== "Tab") {
      return
    }

    const drawer = drawerRef.current
    if (!drawer) {
      return
    }

    const focusableElements = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      element => element.offsetParent !== null,
    )
    if (focusableElements.length === 0) {
      event.preventDefault()
      drawer.focus()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
      return
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
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
        ref={drawerRef}
        className="absolute inset-x-0 bottom-0 flex h-[92dvh] max-h-[92dvh] flex-col rounded-t-lg bg-background shadow-xl lg:inset-x-auto lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:max-h-none lg:w-[520px] lg:rounded-none lg:border-l"
        role="dialog"
        aria-modal="true"
        aria-labelledby="focus-period-drawer-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="focus-period-drawer-title" className="text-lg font-semibold">
              调整年度阶段
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">每段时间只绑定一个目标</p>
          </div>
          <Button ref={closeButtonRef} type="button" variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
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
              min={MIN_YEAR}
              max={MAX_YEAR}
              value={yearInput}
              onChange={event => handleYearChange(event.target.value)}
              onBlur={handleYearBlur}
            />
          </div>
          <Button
            type="button"
            onClick={handleCreateDraft}
            disabled={!hasAvailableGap}
            className="sm:ml-auto"
            title={hasAvailableGap ? "新增阶段" : "当前年份没有可用空白时间段"}
          >
            <Plus className="size-4" />
            新增阶段
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {draftError || !hasAvailableGap ? (
            <p className="mb-3 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              {draftError ?? "当前年份没有可用空白时间段"}
            </p>
          ) : null}
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
