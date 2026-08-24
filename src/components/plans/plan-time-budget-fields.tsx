"use client"

import React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface PlanTimeBudgetFieldsProps {
  isRecurring: boolean
  estimatedMinutes: string
  defaultBlockMinutes: string | null
  globalDefaultBlockMinutes: number
  investedMinutes: number
  reservedActionMinutes: number
  onEstimatedMinutesChange: (value: string) => void
  onDefaultBlockMinutesChange: (value: string | null) => void
}

export function PlanTimeBudgetFields({
  isRecurring,
  estimatedMinutes,
  defaultBlockMinutes,
  globalDefaultBlockMinutes,
  investedMinutes,
  reservedActionMinutes,
  onEstimatedMinutesChange,
  onDefaultBlockMinutesChange,
}: PlanTimeBudgetFieldsProps) {
  const total = Number(estimatedMinutes)
  const hasNumericTotal = estimatedMinutes !== "" && Number.isFinite(total)
  const isOverInvested = hasNumericTotal && total < investedMinutes
  const isOverReserved = hasNumericTotal && total - investedMinutes < reservedActionMinutes
  const displayedBlockMinutes = defaultBlockMinutes ?? String(globalDefaultBlockMinutes)
  const blockLabel = isRecurring ? "每次时长（分钟）" : "默认单块时长（分钟）"

  return (
    <div className="grid grid-cols-1 gap-4 rounded-lg border bg-white p-3 dark:bg-gray-900 md:grid-cols-2 sm:p-4">
      {!isRecurring && (
        <div className="space-y-2">
          <Label htmlFor="estimated_minutes">总预计投入（分钟）</Label>
          <Input
            id="estimated_minutes"
            type="number"
            min={15}
            step={15}
            value={estimatedMinutes}
            onChange={event => onEstimatedMinutesChange(event.target.value)}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="default_block_minutes">{blockLabel}</Label>
        <Input
          id="default_block_minutes"
          type="number"
          min={15}
          step={15}
          value={displayedBlockMinutes}
          onChange={event => onDefaultBlockMinutesChange(event.target.value)}
        />
        {defaultBlockMinutes === null ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            继承全局默认 {globalDefaultBlockMinutes} 分钟
          </p>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-0 py-1 text-xs"
            onClick={() => onDefaultBlockMinutesChange(null)}
          >
            恢复全局默认
          </Button>
        )}
      </div>

      {!isRecurring && (
        <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300 md:col-span-2">
          <p>已投入 {investedMinutes} 分钟</p>
          <p>行动项已预留 {reservedActionMinutes} 分钟</p>
          {isOverInvested && (
            <p className="text-amber-700 dark:text-amber-300">已投入时间超过当前预估</p>
          )}
          {isOverReserved && (
            <p className="text-amber-700 dark:text-amber-300">行动项预留时间超过剩余预算</p>
          )}
        </div>
      )}
    </div>
  )
}
