import React, { Suspense } from 'react'
import AuthGuard from '@/components/AuthGuard'
import { MainLayout } from '@/components/main-layout'
import { MonthlyJournal } from '@/components/journal/monthly-journal'
export default function JournalPage() {
  return <AuthGuard><MainLayout initialSidebarState="closed"><Suspense fallback={<p role="status" className="p-6">正在加载手账…</p>}><MonthlyJournal /></Suspense></MainLayout></AuthGuard>
}
