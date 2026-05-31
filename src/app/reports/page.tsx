"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CalendarDays, RefreshCcw, Save, Trash2 } from "lucide-react"

import AuthGuard from "@/components/AuthGuard"
import { MainLayout } from "@/components/main-layout"
import { MarkdownPreview } from "@/components/ui/markdown-preview"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { TextPreview } from "@/components/ui/text-preview"
import { renderWeeklyReportMarkdown, type WeeklyReportSummary } from "@/lib/weekly-report"

type Report = {
  id: number
  report_id: string
  title: string
  subtitle: string | null
  content: string | null
  gmt_create: string
}

const emptySummary: WeeklyReportSummary = {
  weekStart: "",
  weekEnd: "",
  stats: { progressRecordCount: 0, planCount: 0, goalCount: 0 },
  completedItems: [],
  topGoals: [],
  nextWeekSuggestions: [],
}

export default function ReportsPage() {
  const [summary, setSummary] = useState<WeeklyReportSummary>(emptySummary)
  const [reports, setReports] = useState<Report[]>([])
  const [nextWeekNote, setNextWeekNote] = useState("")
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [loadingReports, setLoadingReports] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const reportMarkdown = useMemo(() => renderWeeklyReportMarkdown(summary, nextWeekNote), [summary, nextWeekNote])

  const fetchWeeklySummary = useCallback(async () => {
    setLoadingSummary(true)
    setError("")
    try {
      const res = await fetch("/api/report/weekly")
      if (!res.ok) throw new Error("获取周报汇总失败")
      setSummary(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取周报汇总失败")
    } finally {
      setLoadingSummary(false)
    }
  }, [])

  const fetchReports = useCallback(async () => {
    setLoadingReports(true)
    try {
      const res = await fetch("/api/report?pageNum=1&pageSize=10")
      if (!res.ok) throw new Error("获取历史报告失败")
      const data = await res.json()
      setReports(data.list || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取历史报告失败")
    } finally {
      setLoadingReports(false)
    }
  }, [])

  useEffect(() => {
    fetchWeeklySummary()
    fetchReports()
  }, [fetchReports, fetchWeeklySummary])

  const handleSave = async () => {
    setSaving(true)
    setError("")
    try {
      const subtitle = `本周记录 ${summary.stats.progressRecordCount} 条进展，推进 ${summary.stats.planCount} 个计划，关联 ${summary.stats.goalCount} 个目标`
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${summary.weekStart} 至 ${summary.weekEnd} 周回顾`,
          subtitle,
          content: reportMarkdown,
        }),
      })
      if (!res.ok) throw new Error("保存周报失败")
      setNextWeekNote("")
      await fetchReports()
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存周报失败")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (reportId: string) => {
    if (!confirm("确定要删除这份报告吗？")) return
    setError("")
    const res = await fetch(`/api/report?report_id=${reportId}`, { method: "DELETE" })
    if (!res.ok) {
      setError("删除报告失败")
      return
    }
    if (selectedReport?.report_id === reportId) setSelectedReport(null)
    await fetchReports()
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 px-3 py-4 sm:space-y-8 sm:px-4 sm:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/">返回首页</Link>
            </Button>
            <Button type="button" variant="outline" onClick={fetchWeeklySummary} disabled={loadingSummary} className="w-full sm:w-auto">
              <RefreshCcw className="mr-2 h-4 w-4" />
              {loadingSummary ? "刷新中..." : "刷新本周回顾"}
            </Button>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">回顾</h1>
            <p className="text-sm text-muted-foreground">自动汇总本周进展，保存前补充你的下周计划。</p>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">进展记录</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-bold">{summary.stats.progressRecordCount}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">推进计划</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-bold">{summary.stats.planCount}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">关联目标</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-bold">{summary.stats.goalCount}</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <CalendarDays className="h-5 w-5" />
                {summary.weekStart && summary.weekEnd ? `${summary.weekStart} 至 ${summary.weekEnd}` : "本周回顾"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <section className="space-y-3">
                <h2 className="text-base font-semibold">本周完成</h2>
                {summary.completedItems.length === 0 ? (
                  <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
                    本周还没有进展记录。可以先去<Link href="/progress" className="mx-1 text-blue-600 hover:underline">记录进展</Link>。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {summary.completedItems.slice(0, 8).map(item => (
                      <div key={item.id} className="rounded-md border p-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="font-medium">{item.planName}</div>
                          <div className="text-xs text-muted-foreground">{new Date(item.gmt_create).toLocaleString()}</div>
                        </div>
                        {item.goalName && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.goalName}{item.goalTag ? ` / ${item.goalTag}` : ""}
                          </div>
                        )}
                        <TextPreview text={item.content} maxLength={120} truncateLines={3} />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <h2 className="text-base font-semibold">推进最多的目标</h2>
                  {summary.topGoals.length === 0 ? (
                    <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">本周还没有关联目标的进展。</div>
                  ) : summary.topGoals.slice(0, 5).map(goal => (
                    <div key={goal.goal_id} className="rounded-md border p-3">
                      <div className="font-medium">{goal.goalName}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {goal.goalTag} / {goal.progressRecordCount} 条进展 / {goal.planCount} 个计划 / 平均进度 {Math.round(goal.averageProgress * 100)}%
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <h2 className="text-base font-semibold">下周建议</h2>
                  {summary.nextWeekSuggestions.length === 0 ? (
                    <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">暂无自动建议。</div>
                  ) : summary.nextWeekSuggestions.map(item => (
                    <div key={item.plan_id} className="rounded-md border p-3">
                      <div className="font-medium">{item.planName}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {item.goalName ? `${item.goalName} / ` : ""}{item.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <Label htmlFor="nextWeekNote">我的下周计划补充</Label>
                <Textarea
                  id="nextWeekNote"
                  value={nextWeekNote}
                  onChange={event => setNextWeekNote(event.target.value)}
                  placeholder="写下你下周最想推进的重点、节奏安排或提醒..."
                  className="min-h-32"
                />
                <Button type="button" onClick={handleSave} disabled={saving || loadingSummary || !summary.weekStart} className="w-full sm:w-auto">
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "保存中..." : "一键保存周报"}
                </Button>
              </section>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">历史报告</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-w-full rounded-lg border">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>标题</TableHead>
                      <TableHead>摘要</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead className="w-[150px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          {loadingReports ? "加载中..." : "暂无历史报告"}
                        </TableCell>
                      </TableRow>
                    ) : reports.map(report => (
                      <TableRow key={report.report_id}>
                        <TableCell className="min-w-0 font-medium">
                          <TextPreview text={report.title} maxLength={48} truncateLines={2} />
                        </TableCell>
                        <TableCell className="min-w-0 text-sm text-muted-foreground">
                          <TextPreview text={report.subtitle || "无摘要"} maxLength={72} truncateLines={2} />
                        </TableCell>
                        <TableCell className="text-sm">{new Date(report.gmt_create).toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button type="button" size="sm" variant="outline" aria-label="查看报告" onClick={() => setSelectedReport(report)}>查看</Button>
                            <Button type="button" size="sm" variant="destructive" aria-label="删除报告" onClick={() => handleDelete(report.report_id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {selectedReport && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl">{selectedReport.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownPreview content={selectedReport.content || ""} maxLines={9999} showToggle={false} />
              </CardContent>
            </Card>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  )
}
