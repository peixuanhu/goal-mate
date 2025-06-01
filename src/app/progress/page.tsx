"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Combobox } from "@/components/ui/combobox"

interface Plan {
  plan_id: string
  name: string
}
interface ProgressRecord {
  id: number
  plan_id: string
  content: string
  thinking: string
  gmt_create: string
}

export default function ProgressPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [planId, setPlanId] = useState('')
  const [records, setRecords] = useState<ProgressRecord[]>([])
  const [form, setForm] = useState<Partial<ProgressRecord>>({})
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams();

  const fetchPlans = async () => {
    const res = await fetch('/api/plan?pageSize=1000')
    const data = await res.json()
    setPlans(data.list || data)
    if (!planId && (data.list?.[0]?.plan_id || data[0]?.plan_id)) {
      setPlanId(data.list?.[0]?.plan_id || data[0]?.plan_id)
    }
  }
  const fetchRecords = async (pid: string) => {
    if (!pid) return
    setLoading(true)
    const res = await fetch(`/api/progress_record?plan_id=${pid}`)
    const data = await res.json()
    setRecords(data.list)
    setLoading(false)
  }
  useEffect(() => { fetchPlans() }, [])
  useEffect(() => { if (planId) fetchRecords(planId) }, [planId])
  useEffect(() => {
    const urlPlanId = searchParams.get('plan_id');
    if (urlPlanId && urlPlanId !== planId) setPlanId(urlPlanId);
  }, [searchParams]);

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/progress_record', {
      method: 'POST',
      body: JSON.stringify({ ...form, plan_id: planId }),
      headers: { 'Content-Type': 'application/json' }
    })
    setForm({})
    await fetchRecords(planId)
    setLoading(false)
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-8">
      <div className="mb-4">
        <Button asChild variant="outline">
          <Link href="/">返回首页</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>进展记录</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-4 items-center">
            <Label>选择计划</Label>
            <Combobox
              options={plans.map(p => p.name)}
              value={plans.find(p => p.plan_id === planId)?.name || ''}
              onChange={v => {
                const p = plans.find(p => p.name === v)
                if (p) setPlanId(p.plan_id)
              }}
              placeholder="请选择计划"
              className="w-64"
            />
          </div>
          <form onSubmit={handleSubmit} className="space-y-4 mb-8">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="content">进展内容</Label>
                <Textarea id="content" className="w-full min-h-[40px]" placeholder="进展内容" value={form.content || ''} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} required />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="thinking">思考总结</Label>
                <Textarea id="thinking" className="w-full min-h-[40px]" placeholder="思考总结" value={form.thinking || ''} onChange={e => setForm(f => ({ ...f, thinking: e.target.value }))} />
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-32">添加进展</Button>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>内容</TableHead>
                <TableHead>思考</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.gmt_create).toLocaleString()}</TableCell>
                  <TableCell>{r.content}</TableCell>
                  <TableCell>{r.thinking}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
