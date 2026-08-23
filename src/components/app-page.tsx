import React, { type ReactNode } from "react"

import { cn } from "@/lib/utils"

interface AppPageProps {
  children: ReactNode
  className?: string
  contentClassName?: string
}

interface PageHeaderProps {
  actions?: ReactNode
  className?: string
  description?: ReactNode
  eyebrow?: string
  title: string
}

interface PageSurfaceProps {
  children: ReactNode
  className?: string
}

export function AppPage({ children, className, contentClassName }: AppPageProps) {
  return (
    <div className={cn("min-h-full bg-stone-50 text-stone-900", className)}>
      <div className={cn("mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8", contentClassName)}>
        {children}
      </div>
    </div>
  )
}

export function PageHeader({ actions, className, description, eyebrow, title }: PageHeaderProps) {
  return (
    <section className={cn("flex flex-col gap-4 border-b border-stone-200/80 pb-6 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{eyebrow}</p> : null}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </section>
  )
}

export function PageSurface({ children, className }: PageSurfaceProps) {
  return (
    <section className={cn("rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]", className)}>
      {children}
    </section>
  )
}
