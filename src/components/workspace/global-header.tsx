"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import React from "react"

import UserMenu from "@/components/UserMenu"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/", label: "今天" },
  { href: "/goals", label: "目标" },
  { href: "/plans", label: "计划" },
  { href: "/progress", label: "进展" },
  { href: "/reports", label: "回顾" },
] as const

export function GlobalHeader() {
  const pathname = usePathname()

  return (
    <header className="z-30 shrink-0 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 min-w-0 items-center gap-3 px-3 sm:px-5">
        <Link aria-label="Goal Mate 今日首页" className="flex shrink-0 items-center gap-2" href="/">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gray-950 text-sm font-bold text-white">G</span>
          <span className="hidden font-semibold tracking-tight sm:inline">Goal Mate</span>
        </Link>

        <nav aria-label="主导航" className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex w-max items-center gap-1">
            {NAV_ITEMS.map(item => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-900",
                    active && "bg-gray-100 font-medium text-gray-900",
                  )}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="shrink-0"><UserMenu /></div>
      </div>
    </header>
  )
}
