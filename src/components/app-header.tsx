"use client"

import { Target } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import React from "react"

import { cn } from "@/lib/utils"

import UserMenu from "./UserMenu"

const navigation = [
  { href: "/", label: "今天" },
  { href: "/goals", label: "目标" },
  { href: "/plans", label: "计划" },
  { href: "/progress", label: "进展" },
  { href: "/reports", label: "回顾" },
]

interface AppHeaderProps {
  className?: string
  showUserMenu?: boolean
}

export function AppHeader({ className, showUserMenu = true }: AppHeaderProps) {
  const pathname = usePathname() ?? "/"

  return (
    <header className={cn("shrink-0 border-b border-stone-200/80 bg-white/95 backdrop-blur", className)}>
      <div className="mx-auto flex h-16 max-w-[1720px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link aria-label="Goal Mate 今日首页" className="flex shrink-0 items-center gap-2.5" href="/">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200">
            <Target aria-hidden="true" className="h-5 w-5" />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight text-stone-950 sm:inline">Goal Mate</span>
        </Link>

        <nav aria-label="主导航" className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-center gap-1 rounded-xl bg-stone-100/80 p-1">
            {navigation.map(item => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-white text-stone-950 shadow-sm ring-1 ring-stone-200/70"
                      : "text-stone-500 hover:bg-white/70 hover:text-stone-900",
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

        {showUserMenu ? <div className="shrink-0"><UserMenu /></div> : null}
      </div>
    </header>
  )
}
