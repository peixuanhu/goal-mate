# Monthly Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个月一页、每天一行的可配置手账，统一查看习惯、数量、存量快照、心情、事件，并联动已有计划与进展记录。

**Architecture:** 独立 `/journal` 页面复用应用外壳。追踪定义及语义版本、类型化测量、自定义事件独立持久化；月查询动态投影现有计划、进展、时间块与主线阶段。写入服务集中处理事务、来源引用、版本冲突与重复计次，界面不维护第二份计划完成状态。

**Tech Stack:** Next.js 15.3.6、React 19、TypeScript、Prisma 6/PostgreSQL、Tailwind CSS、Vitest、Testing Library。复用现有日期/时区工具和 `goal-mate:data-changed` 事件，不引入新运行依赖。

---

## 执行上下文

- 仓库工作树：`/Users/peixuan/Project/goal-mate/.worktrees/monthly-journal`。
- 分支：`codex/monthly-journal`，基线 `f4cf911`。
- 已确认规格：`docs/superpowers/specs/2026-09-27-monthly-journal-design.md`。原稿在 `/Users/peixuan/blog_content/_drafts/AI brainstorming/2026-09-27-goal-mate-monthly-journal-design.md`。
- 已评审草图：`/Users/peixuan/.codex/visualizations/2026/09/27/01a0e1b9-1034-7680-965c-8742e94b3431/monthly-journal.html`。用它核对排布和交互，生产页面使用 React 与现有组件。
- 隔离工作树已运行基线测试：55 个文件、792 项测试通过。规划阶段未修改应用代码或数据库。
- 文件路径以下相对于该工作树。`docs/` 和 `prisma/migrations/` 在 `.gitignore` 中；仅对本计划、规格及明确创建的迁移文件使用 `git add -f`，不更改整个忽略规则。
- 开始执行应用代码时先在工作树运行 `npm ci` 和 `npm run db:generate`，取得独立依赖及生成客户端。规划阶段可解析祖先目录的现有依赖；执行新 schema 时不可共用父仓库的生成客户端。
- 数据库验收只连接单独的开发/测试数据库；不把执行计划中的 schema 命令指向现有正式数据库。

## 已锁定的行为

1. 手动、计划完成记录、结构化进展字段是每列独立选择的来源。自动格修改原来源；不保存无说明的手动覆盖。
2. 空值、0、false、跳过、不适用、未来日期分开处理。安排了时间块和计划到期只产生计划提示。
3. 数量按设置做当日 sum/last，月度累计当日值；存量只取最后有效值及与月初基线的变化；缺失快照不补点、不接线。
4. 结构化字段使用追踪项 ID 作字段 ID。进展编辑器只展示 `progress_field` 来源、且未绑定计划或绑定当前计划的定义；不从正文抽取值。
5. 同一天多个手动习惯列关联同一计划时，共用一条有效完成来源。真实执行的多条已有进展仍是多次完成，按记录 ID 去重，不按日期去重。
6. 记录百分比进度继续由用户显式操作；填粉丝、播放量、库存等默认不改变完成次数或百分比。
7. 新追踪项从启用日期生效，归档从归档日期起不适用。改变单位、来源、日汇总或同步完成规则时，新语义版本默认从下一月第一天生效；显示名称、颜色和顺序可以立即修改。历史测量保存原版本。
8. 首版每天每列只有一个直接手动值；进展字段允许多条来源测量。直接填写自动字段时，在编辑器选择来源进展或创建一条带计划的进展。
9. 历史来源删除后保留测量原值与来源快照。`progress_field` 的孤立来源不参与自动汇总，在当天详情中标注已删除；独立手动测量仍保留。
10. 跨日事件、FocusPeriod 和当天事件共享日期轴。已有计划无开始日期，不伪造跨日范围。

## 文件边界

| 文件 | 责任 |
| --- | --- |
| `prisma/schema.prisma`、`prisma/journal-integrity.sql` | 数据结构、唯一性、类型/日期/版本约束 |
| `src/lib/journal/types.ts` | 前后端 DTO、列配置、来源与值的类型 |
| `src/lib/journal/date.ts` | 月份键、当月日期与用户时区的 UTC 范围 |
| `src/lib/journal/validation.ts` | 严格解析配置、测量、事件请求 |
| `src/lib/journal/aggregate.ts` | 日汇总、月汇总、快照基线与连续状态 |
| `src/lib/journal/events.ts` | 日期事件、跨月裁剪与区间轨道分配 |
| `src/lib/journal/tracker-service.ts` | 列创建、显示设置、语义版本、排序与归档 |
| `src/lib/journal/measurement-service.ts` | 手动格与来源测量写入，版本与事务 |
| `src/lib/journal/completion-link.ts` | 有效完成判定、共享来源、撤销时的所有权判断 |
| `src/lib/progress-record-service.ts` | 原进展 CRUD 与结构化字段的统一事务入口 |
| `src/lib/journal/event-service.ts` | 自定义事件 CRUD 与显式完成联动 |
| `src/lib/journal/query.ts` | 完整月查询及 DTO 装配，不写数据库 |
| `src/lib/journal/http.ts` | 新 API 的认证、JSON 与领域错误响应 |
| `src/lib/journal/client.ts` | 类型化请求、共享刷新事件 |
| `src/app/api/journal/month/route.ts` | 月查询 GET |
| `src/app/api/journal/trackers/route.ts` | 列 GET/POST/PUT 与排序/归档操作 |
| `src/app/api/journal/measurements/route.ts` | 手动测量 PUT/DELETE；自动值通过原进展 API 写入 |
| `src/app/api/journal/events/route.ts` | 事件 POST/PUT/DELETE |
| `src/components/journal/use-journal-month.ts` | 查询生命周期、取消与旧响应抑制 |
| `src/components/journal/monthly-journal.tsx` | 月份导航与三个编辑器的编排 |
| `src/components/journal/journal-sheet.tsx`、`journal-sheet.module.css` | 月行、日期轴、分组及区间排布 |
| `src/components/journal/journal-cell.tsx` | 类型化格子与数值/状态的可访问表达 |
| `src/components/journal/tracker-editor.tsx` | 列配置、条件字段与预览 |
| `src/components/journal/cell-editor.tsx` | 数值、分类、跳过、来源与撤销 |
| `src/components/journal/day-detail.tsx`、`event-editor.tsx` | 当天所有来源与事件编辑 |
| `src/components/journal/progress-metric-fields.tsx` | 现有进展表单中的结构化测量 |
| `src/app/journal/page.tsx` | AuthGuard、Suspense 与月度入口 |
| `src/components/main-layout.tsx`、`app-header.tsx` | 页面可选默认收起侧栏、手账导航 |
| `src/app/progress/page.tsx`、`src/app/api/progress_record/route.ts` | 共享进展写入、来源跳转、结构化字段 |

每个纯函数/服务配同目录 `.test.ts`；交互组件使用 `.behavior.test.tsx`。避免把全部功能塞入单个页面。

## Task 1: 类型、日期与有效完成规则

**Files:** Create `src/lib/journal/types.ts`, `date.ts`, `date.test.ts`, `completion-link.ts`, `completion-link.test.ts`。

- [x] **Step 1: 写真实边界测试。**

```ts
import { describe, expect, it } from 'vitest'
import { journalMonthRange, listMonthDates } from './date'
import { isJournalCompletion } from './completion-link'

describe('journal calendar', () => {
  it('handles leap February and Shanghai month boundaries', () => {
    expect(listMonthDates('2028-02')).toHaveLength(29)
    expect(listMonthDates('2026-02')).toHaveLength(28)
    const range = journalMonthRange('2026-09', 'Asia/Shanghai')
    expect(range.start.toISOString()).toBe('2026-08-31T16:00:00.000Z')
    expect(range.endExclusive.toISOString()).toBe('2026-09-30T16:00:00.000Z')
  })
  it('uses civil boundaries across DST', () => {
    const range = journalMonthRange('2026-11', 'America/New_York')
    expect(range.start.toISOString()).toBe('2026-11-01T04:00:00.000Z')
    expect(range.endExclusive.toISOString()).toBe('2026-12-01T05:00:00.000Z')
  })
  it('distinguishes legacy recurrence records from ordinary prose', () => {
    expect(isJournalCompletion({outcome:null, counts_toward_recurrence:true}, true)).toBe(true)
    expect(isJournalCompletion({outcome:null, counts_toward_recurrence:true}, false)).toBe(false)
    expect(isJournalCompletion({outcome:'partial', counts_toward_recurrence:true}, true)).toBe(false)
    expect(isJournalCompletion({outcome:'completed', counts_toward_recurrence:false}, true)).toBe(false)
  })
})
```

- [x] **Step 2: 运行 RED。** `npm test -- src/lib/journal/date.test.ts src/lib/journal/completion-link.test.ts`，预期缺少模块失败。

- [x] **Step 3: 定义共享类型并实现日期与完成判定。**

`types.ts` 的核心接口如下，后续文件以这些字段为准；Prisma Decimal 转换到 DTO 时输出十进制字符串，图形尺寸计算才转换为 Number。

```ts
export type TrackerKind = 'boolean' | 'quantity' | 'snapshot' | 'enum'
export type TrackerSource = 'manual' | 'plan' | 'progress_field'
export type RecordedValue = boolean | string
export type CellState = 'missing' | 'recorded' | 'skipped' | 'not_applicable' | 'future'
export type EnumOption = { id:string; label:string; symbol:string; color:string }
export type TrackerConfig = {
  unit:string; source:TrackerSource; daily_aggregation:'any'|'sum'|'last'
  encoding:'fill'|'number'|'blocks'|'heat'|'line'|'symbol'
  units_per_cell:string; threshold:string|null; minimum:string|null; maximum:string|null
  sync_completion:boolean; active_weekdays:number[]; enum_options:EnumOption[]
}
export type TrackerRevisionView = {
  revision_id:string; effective_from:string; plan_id:string|null; plan_name:string|null
  goal_id:string|null; goal_name:string|null; config:TrackerConfig
}
export type TrackerView = {
  tracker_id:string; name:string; kind:TrackerKind; group:string; color:string
  position:number; version:number; enabled_from:string; archived_from:string|null
  revisions:TrackerRevisionView[]
}
export type MeasurementView = {
  measurement_id:string; tracker_id:string; revision_id:string; local_date:string
  value:RecordedValue|null; status:'recorded'|'skipped'|'cleared'; note:string
  origin:'manual'|'progress_field'; version:number; recorded_at:string
  progress_record_id:number|null; source_record_id:number|null; source_deleted:boolean
}
export type CompletionRecord = {
  id:number; plan_id:string; gmt_create:string; outcome:string|null
  counts_toward_recurrence:boolean; content:string|null; thinking:string|null
  plan:{name:string; is_recurring:boolean}; version:number
}
export type CellSource = {
  kind:'measurement'|'progress'; id:string; label:string; version:number
  deleted:boolean; legacy:boolean
}
export type JournalCell = {
  tracker_id:string; date:string; revision_id:string|null; state:CellState
  value:RecordedValue|null; sources:CellSource[]; measurement_id:string|null; version:number
}
export type JournalEventView = {
  event_id:string; title:string; start_date:string; end_date:string; note:string
  source:'custom'|'progress'|'plan_due'|'action_due'|'focus'|'schedule'
  status:'planned'|'progress'|'completed'; plan_id:string|null; goal_id:string|null
  progress_record_id:number|null; version:number|null; sync_completion:boolean
}
export type EventLane = JournalEventView & {
  clipped_start:string; clipped_end:string; continues_before:boolean; continues_after:boolean; lane:number
}
export type TrackerSummary = {
  tracker_id:string; revision_id:string; unit:string; completed_days:number
  sum:string|null; last:string|null; baseline:string|null; delta:string|null
  categories:Record<string,number>; applicable_days:number; recorded_days:number
  streak:number|null; completion_rate:number|null
}
export type JournalMonthView = {
  month:string; timezone:string; today:string; dates:string[]; trackers:TrackerView[]
  cells:Record<string,Record<string,JournalCell>>; measurements:MeasurementView[]; events:JournalEventView[]
  lanes:EventLane[]; summaries:TrackerSummary[]
}
export type PutMeasurementInput = {
  tracker_id:string; date:string; expected_version:number; value:RecordedValue|null
  status:'recorded'|'skipped'|'cleared'; note:string; request_id:string
}
export type ProgressMetricInput = {
  tracker_id:string; revision_id:string; value:RecordedValue|null; status:'recorded'|'skipped'|'cleared'; note:string
}
export type ProgressRecordView = {
  id:number; plan_id:string; content:string; thinking:string; gmt_create:string
  outcome:string|null; counts_toward_recurrence:boolean; schedule_block_id:string|null
  version:number; metrics:MeasurementView[]
}
export type ProgressWriteInput = {
  plan_id:string; content:string; thinking:string; custom_time?:string
  outcome?:'completed'|'partial'|'skipped'|null; metrics?:ProgressMetricInput[]
  plan_progress?:number; request_id?:string
}
export type ProgressUpdateInput = Partial<ProgressWriteInput> & {id:number;expected_version?:number}
export type TrackerCreateInput = {
  name:string;kind:TrackerKind;group:string;color:string;enabled_from:string
  plan_id:string|null;goal_id:string|null;config:TrackerConfig
}
export type TrackerUpdateInput =
  | {action:'display';tracker_id:string;expected_version:number;name:string;group:string;color:string}
  | {action:'revise';tracker_id:string;expected_version:number;effective_from:string;
     plan_id:string|null;goal_id:string|null;config:TrackerConfig}
export type TrackerOrderInput={ids:string[];expected_versions:Record<string,number>}
export type TrackerArchiveInput={tracker_id:string;expected_version:number;archived_from:string}
export type JournalEventInput={
  title:string;start_date:string;end_date:string;note:string;status:'planned'|'progress'|'completed'
  plan_id:string|null;goal_id:string|null;sync_completion:boolean;request_id:string
}
export type JournalEventUpdateInput=JournalEventInput & {event_id:string;expected_version:number}
export type JournalErrorCode = 'VALIDATION'|'NOT_FOUND'|'STALE_VERSION'|'SOURCE_CHANGED'
export class JournalError extends Error {
  constructor(public code:JournalErrorCode, message:string) { super(message) }
}
```

`date.ts`：

```ts
import { addDays, parseDateOnly } from '@/lib/focus-period-utils'
import { nextExistingLocalDateStartToUtc } from '@/lib/today/timezone'

export function listMonthDates(month:string):string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('month 必须为 YYYY-MM')
  const first = `${month}-01`
  const date = parseDateOnly(first)
  const next = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)).toISOString().slice(0,10)
  const days:string[] = []
  for (let day=first;day<next;day=addDays(day,1)) days.push(day)
  return days
}
export function journalMonthRange(month:string, timezone:string) {
  const dates = listMonthDates(month)
  const first=dates[0], last=dates[dates.length-1], endDate=addDays(last,1)
  return {
    dates, first, last, endDate,
    start:nextExistingLocalDateStartToUtc(addDays(first,-1),timezone),
    endExclusive:nextExistingLocalDateStartToUtc(last,timezone),
  }
}
```

`completion-link.ts` 的判定核心：

```ts
export function isJournalCompletion(
  record:{outcome:string|null;counts_toward_recurrence:boolean}, recurring:boolean,
) {
  return record.counts_toward_recurrence && (
    record.outcome === 'completed' || (record.outcome === null && recurring)
  )
}
```

- [x] **Step 4: 验证 GREEN。** 同 Step 2 命令；增加无效月份 `2026-00/13`、年末跨年与 skipped 断言。重复 ID 去重属于 Task 4/5 的汇总测试。
- [x] **Step 5: 提交。** `git add src/lib/journal && git commit -m "feat: define monthly journal contracts and calendar rules"`。

## Task 2: 持久化模型与可重复执行的完整性 SQL

**Files:** Modify `prisma/schema.prisma`, `package.json`; Create `prisma/journal-integrity.sql`, `src/lib/journal/schema.integration.test.ts`。

- [x] **Step 1: 写真实数据库约束测试。** 使用独立 JOURNAL_TEST_DATABASE_URL，缺少变量时 skip，不能回落到现有 DATABASE_URL。创建两个定义/版本，验证数据库拒绝第二个同日期手动值和错 tracker 的 revision。测试不用字符串匹配 schema 来代替 SQL 行为。

```ts
import { PrismaClient } from '@prisma/client'
import { afterAll,beforeAll,describe,expect,it } from 'vitest'
describe.skipIf(!process.env.JOURNAL_TEST_DATABASE_URL)('journal persistence',()=>{
  let db:PrismaClient
  const ids:string[]=[]
  beforeAll(()=>{db=new PrismaClient({datasourceUrl:process.env.JOURNAL_TEST_DATABASE_URL})})
  afterAll(async()=>{
    await db.trackerMeasurement.deleteMany({where:{tracker_id:{in:ids}}})
    await db.trackerRevision.deleteMany({where:{tracker_id:{in:ids}}})
    await db.trackerDefinition.deleteMany({where:{tracker_id:{in:ids}}})
    await db.$disconnect()
  })
  it('enforces one manual row and a revision belonging to its tracker',async()=>{
    const seed=async()=>{
      const row=await db.trackerDefinition.create({data:{name:'test',kind:'boolean',
        enabled_from:new Date('2026-09-01T00:00:00Z'),
        revisions:{create:{effective_from:new Date('2026-09-01T00:00:00Z'),config:{}}},
      },include:{revisions:true}})
      ids.push(row.tracker_id)
      return row
    }
    const first=await seed(),second=await seed()
    const value={tracker_id:first.tracker_id,revision_id:first.revisions[0].revision_id,
      local_date:new Date('2026-09-12T00:00:00Z'),origin:'manual',boolean_value:false}
    await db.trackerMeasurement.create({data:value})
    await expect(db.trackerMeasurement.create({data:value})).rejects.toMatchObject({code:'P2002'})
    await expect(db.trackerMeasurement.create({data:{...value,
      local_date:new Date('2026-09-13T00:00:00Z'),revision_id:second.revisions[0].revision_id,
    }})).rejects.toMatchObject({code:'P2003'})
  })
})
```

- [x] **Step 2: 运行 RED。** `npm test -- src/lib/journal/schema.integration.test.ts`；配置专用测试库后，预期新模型/SQL 尚未存在而失败，skip 不能作为 RED 或 GREEN 证据。
- [x] **Step 3: 追加模型。**

```prisma
model TrackerDefinition {
  tracker_id   String   @id @default(uuid())
  gmt_create   DateTime @default(now())
  gmt_modified DateTime @updatedAt
  name         String
  kind         String
  group        String   @default("默认")
  color        String   @default("#b6d99d")
  position     Int      @default(0)
  version      Int      @default(1)
  enabled_from DateTime @db.Date
  archived_from DateTime? @db.Date
  revisions    TrackerRevision[]
  measurements TrackerMeasurement[]
  @@index([position, tracker_id])
}
model TrackerRevision {
  revision_id  String @id @default(uuid())
  tracker_id   String
  effective_from DateTime @db.Date
  config       Json
  plan_id      String?
  goal_id      String?
  plan_name    String?
  goal_name    String?
  tracker      TrackerDefinition @relation(fields:[tracker_id], references:[tracker_id], onDelete:Restrict)
  plan         Plan? @relation(fields:[plan_id], references:[plan_id], onDelete:SetNull)
  goal         Goal? @relation(fields:[goal_id], references:[goal_id], onDelete:SetNull)
  measurements TrackerMeasurement[]
  @@unique([tracker_id, effective_from])
  @@unique([revision_id, tracker_id])
  @@index([plan_id])
}
model TrackerMeasurement {
  measurement_id String @id @default(uuid())
  gmt_create DateTime @default(now())
  gmt_modified DateTime @updatedAt
  tracker_id String
  revision_id String
  local_date DateTime @db.Date
  recorded_at DateTime @default(now())
  status String @default("recorded")
  origin String
  boolean_value Boolean?
  numeric_value Decimal? @db.Decimal(20,4)
  enum_value String?
  note String @default("")
  version Int @default(1)
  request_id String?
  progress_record_id Int?
  source_record_id Int?
  tracker TrackerDefinition @relation(fields:[tracker_id], references:[tracker_id], onDelete:Restrict)
  revision TrackerRevision @relation(fields:[revision_id,tracker_id], references:[revision_id,tracker_id], onDelete:Restrict)
  progressRecord ProgressRecord? @relation(fields:[progress_record_id], references:[id], onDelete:SetNull)
  @@unique([tracker_id, progress_record_id])
  @@index([tracker_id, local_date])
  @@index([progress_record_id])
}
model JournalEvent {
  event_id String @id @default(uuid())
  gmt_create DateTime @default(now())
  gmt_modified DateTime @updatedAt
  title String
  start_date DateTime @db.Date
  end_date DateTime @db.Date
  note String @default("")
  status String @default("planned")
  version Int @default(1)
  plan_id String?
  goal_id String?
  plan_name String?
  goal_name String?
  completion_record_id Int?
  sync_completion Boolean @default(false)
  request_id String @unique
  plan Plan? @relation(fields:[plan_id], references:[plan_id], onDelete:SetNull)
  goal Goal? @relation(fields:[goal_id], references:[goal_id], onDelete:SetNull)
  completionRecord ProgressRecord? @relation(fields:[completion_record_id], references:[id], onDelete:SetNull)
  @@index([start_date, end_date])
}
```

向 `Goal` 增加 `trackerRevisions TrackerRevision[]`、`journalEvents JournalEvent[]`；向 `Plan` 增加相同反向关系。向 `ProgressRecord` 增加：

```prisma
version                Int @default(1)
journal_completion_key String? @unique
journal_request_id     String? @unique
journalMeasurements    TrackerMeasurement[]
journalEvents          JournalEvent[]
@@index([gmt_create])
```

`journal-integrity.sql` 使用现有 DO/duplicate_object 模式安装检查约束，不删除原表。两项唯一索引如下；cleared 手动格保留行与版本，可恢复，不能通过重复创建绕开版本。

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "TrackerMeasurement_manual_cell_idx"
ON "TrackerMeasurement" ("tracker_id", "local_date") WHERE "origin" = 'manual';

DO $$ BEGIN
  ALTER TABLE "TrackerMeasurement" ADD CONSTRAINT "TrackerMeasurement_value_check"
  CHECK (
    ("status" IN ('skipped','cleared') AND num_nonnulls("boolean_value","numeric_value","enum_value")=0)
    OR ("status"='recorded' AND num_nonnulls("boolean_value","numeric_value","enum_value")=1)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

同文件追加以下约束。上方复合外键保证 revision 所属 tracker 与测量相同。跨类型值由写入服务在锁定 revision 后校验，SQL `num_nonnulls` 保证零值/false 也是有值。

```sql
DO $$ BEGIN
  ALTER TABLE "TrackerDefinition" ADD CONSTRAINT "TrackerDefinition_valid_check"
  CHECK ("kind" IN ('boolean','quantity','snapshot','enum') AND "version">0 AND "position">=0
    AND ("archived_from" IS NULL OR "archived_from">="enabled_from"));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TrackerMeasurement" ADD CONSTRAINT "TrackerMeasurement_origin_check"
  CHECK ("origin" IN ('manual','progress_field') AND "version">0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "JournalEvent" ADD CONSTRAINT "JournalEvent_valid_check"
  CHECK ("end_date">="start_date" AND "status" IN ('planned','progress','completed') AND "version">0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

`package.json` 合并已有 integrity 脚本：

```json
{
  "db:integrity:today": "prisma db execute --file prisma/today-workspace-integrity.sql --schema prisma/schema.prisma",
  "db:integrity:journal": "prisma db execute --file prisma/journal-integrity.sql --schema prisma/schema.prisma",
  "db:integrity": "npm run db:integrity:today && npm run db:integrity:journal"
}
```

- [x] **Step 4: 验证。** `npx prisma validate`、`npm run db:generate`；测试数据库上运行 `npm run db:push` 两次，第二次成功。`JOURNAL_TEST_DATABASE_URL="$JOURNAL_TEST_DATABASE_URL" npm test -- src/lib/journal/schema.integration.test.ts` 全部 PASS。补真实 SQL 测试拒绝非法状态、无值 recorded 和倒置事件日期。schema 模式以现有 `db push` 部署方式为准，不切换全仓迁移体系。
- [x] **Step 5: 提交。** `git add prisma/schema.prisma prisma/journal-integrity.sql package.json src/lib/journal/schema.integration.test.ts && git commit -m "feat: persist versioned journal trackers measurements and events"`。

## Task 3: 请求校验与历史版本选择

**Files:** Create `src/lib/journal/validation.ts`, `validation.test.ts`, `tracker-service.ts`, `tracker-service.test.ts`。

- [x] **Step 1: 写类型/配置失败用例。**

```ts
import { expect,it } from 'vitest'
import { parseJournalValue, revisionForDate } from './validation'
it('preserves false and numeric zero; rejects enum labels as IDs',()=>{
  expect(parseJournalValue('boolean',false,[])).toBe(false)
  expect(parseJournalValue('quantity','0',[])).toBe('0')
  expect(()=>parseJournalValue('quantity','NaN',[])).toThrow()
  expect(()=>parseJournalValue('snapshot','1.12345',[])).toThrow()
  expect(()=>parseJournalValue('enum','开心',[{id:'happy',label:'开心',symbol:'☺',color:'#aabbcc'}])).toThrow()
})
it('selects semantic revision by the occurrence date',()=>{
  const revisions=[{effective_from:'2026-09-01',revision_id:'v1'},{effective_from:'2026-10-01',revision_id:'v2'}]
  expect(revisionForDate(revisions,'2026-09-30')?.revision_id).toBe('v1')
  expect(revisionForDate(revisions,'2026-10-01')?.revision_id).toBe('v2')
})
```

- [x] **Step 2: 运行 RED。** `npm test -- src/lib/journal/validation.test.ts src/lib/journal/tracker-service.test.ts`。
- [x] **Step 3: 实现值解析、版本选择和列服务。**

```ts
import { JournalError, type EnumOption, type TrackerKind } from './types'
export function parseJournalValue(kind:TrackerKind,value:unknown,options:EnumOption[]) {
  if (kind==='boolean' && typeof value==='boolean') return value
  if (kind==='enum' && typeof value==='string' && options.some(option=>option.id===value)) return value
  if (kind==='quantity'||kind==='snapshot') {
    const text=typeof value==='number'?String(value):value
    if (typeof text==='string' && /^-?\d{1,16}(\.\d{1,4})?$/.test(text)) return text
  }
  throw new JournalError('VALIDATION','记录值不符合该列的类型或精度')
}
export function revisionForDate<T extends {effective_from:string}>(revisions:T[],date:string):T|null {
  return revisions.filter(revision=>revision.effective_from<=date)
    .sort((a,b)=>b.effective_from.localeCompare(a.effective_from))[0]??null
}
```

配置解析必须显式列出允许字段；JSON 数组、null、未知字段返回 400。名称 1–80 字符；分组 1–40；颜色 `^#[0-9a-fA-F]{6}$`；枚举 1–30 个稳定唯一 ID，不允许删除已用选项；所有 decimal 使用上述格式；numeric 范围一致；blocks 的 units_per_cell >0；sync_completion 只允许 boolean/quantity 且关联 plan；quantity 同步阈值必填且 >=0，只有 value >= threshold 算一次。boolean 的 aggregation=any，snapshot/enum=last；source=plan 只接受 boolean/quantity，必须关联计划。active_weekdays 仅 1–7，无重复，空数组表示每天。事件/记录日期复用 parseDateOnly 校验真实日期。

`tracker-service.ts` 导出 `createTracker(db,input:TrackerCreateInput)`、`updateTracker(db,input:TrackerUpdateInput)`、`reorderTrackers(db,input:TrackerOrderInput)`、`archiveTracker(db,input:TrackerArchiveInput)`，都返回更新后的 TrackerView（排序返回 TrackerView[]）。create 在一个事务创建定义与首版本；更新用 tracker.version 条件 updateMany + increment。顺序写入先按 tracker_id 排序获取行锁，核对 expected_versions，再按用户顺序写 position 并增加 version；提交时检查 ID 列表与当前未归档集合完全一致，返回 409 防止覆盖新列。归档不 delete；首版 archived_from 默认为用户时区的今天。

语义更新事务核心为：

```ts
const updated=await tx.trackerDefinition.updateMany({
  where:{tracker_id:input.tracker_id,version:input.expected_version},
  data:{version:{increment:1}},
})
if (updated.count!==1) throw new JournalError('STALE_VERSION','追踪列已变化，请重新读取')
await tx.trackerRevision.create({data:{
  tracker_id:input.tracker_id, effective_from:new Date(`${input.effective_from}T00:00:00Z`),
  config:input.config, plan_id:input.plan_id, goal_id:input.goal_id,
  plan_name:input.plan_name, goal_name:input.goal_name,
}})
```

此片段放在 `updateTracker` 的语义分支中；input 使用函数内严格解析结果和数据库查询的关联名称，不能信任客户端名称快照。普通显示分支只更新 name/group/color/position 与 version，不覆盖 revision 语义字段。已有同一天生效版本时返回 409；禁止生效日期覆盖已有历史语义。

- [x] **Step 4: 验证 GREEN。** 覆盖旧月份读取、归档保留、非法类型转换、过期版本、已删除关联计划、重新排序并发新列，以及 enum 选项历史 ID。
- [x] **Step 5: 提交。** `git add src/lib/journal/validation* src/lib/journal/tracker-service* && git commit -m "feat: validate journal definitions and preserve historical meaning"`。

## Task 4: 日/月汇总、适用日期与缺测趋势

**Files:** Create `src/lib/journal/aggregate.ts`, `aggregate.test.ts`。

- [x] **Step 1: 写防止口径混淆的测试。**

```ts
import { expect,it } from 'vitest'
import { aggregateDay, summarizeNumericMonth } from './aggregate'
it('keeps numeric zero recorded and sums decimal quantities exactly',()=>{
  const samples=[{id:'a',timestamp:'2026-09-01T01:00Z',value:'0',status:'recorded' as const}]
  expect(aggregateDay('quantity','sum',samples)).toEqual({state:'recorded',value:'0'})
  expect(summarizeNumericMonth('quantity',['0.1','0.2'],null)).toEqual({sum:'0.3',last:null,baseline:null,delta:null})
})
it('reports the final snapshot and growth, rather than adding snapshots',()=>{
  expect(summarizeNumericMonth('snapshot',['1080','1090','1100'],'1070'))
    .toEqual({sum:null,last:'1100',baseline:'1070',delta:'30'})
  expect(summarizeNumericMonth('snapshot',[],null))
    .toEqual({sum:null,last:null,baseline:null,delta:null})
})
it('uses deterministic observation order for last',()=>{
  const samples=[
    {id:'b',timestamp:'2026-09-01T09:00Z',value:'8',status:'recorded' as const},
    {id:'a',timestamp:'2026-09-01T08:00Z',value:'3',status:'recorded' as const},
  ]
  expect(aggregateDay('snapshot','last',samples).value).toBe('8')
})
```

- [x] **Step 2: 运行 RED。** `npm test -- src/lib/journal/aggregate.test.ts`。
- [x] **Step 3: 实现精确汇总核心。**

```ts
import { Prisma } from '@prisma/client'
import type { CellState,RecordedValue,TrackerKind } from './types'
export type AggregateSample={
  id:string;timestamp:string;value:RecordedValue|null;status:'recorded'|'skipped'|'cleared'
}
export function aggregateDay(kind:TrackerKind,aggregation:'any'|'sum'|'last',samples:AggregateSample[]) {
  const unique=[...new Map(samples.map(sample=>[sample.id,sample])).values()]
  const recorded=unique.filter(sample=>sample.status==='recorded'&&sample.value!==null)
    .sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||a.id.localeCompare(b.id))
  if (!recorded.length) return {
    state:unique.some(sample=>sample.status==='skipped')?'skipped' as const:'missing' as const,value:null,
  }
  if (kind==='boolean') return {state:'recorded' as const,value:recorded.some(sample=>sample.value===true)}
  if (kind==='quantity'&&aggregation==='sum') return {
    state:'recorded' as const,
    value:recorded.reduce((sum,sample)=>sum.plus(String(sample.value)),new Prisma.Decimal(0)).toString(),
  }
  return {state:'recorded' as const,value:recorded[recorded.length-1].value}
}
export function summarizeNumericMonth(kind:'quantity'|'snapshot',values:string[],baseline:string|null) {
  if (kind==='quantity') return {
    sum:values.length?values.reduce((sum,value)=>sum.plus(value),new Prisma.Decimal(0)).toString():null,
    last:null,baseline:null,delta:null,
  }
  const last=values[values.length-1]??null
  return {sum:null,last,baseline,delta:last!==null&&baseline!==null?new Prisma.Decimal(last).minus(baseline).toString():null}
}
```

同文件导出 `isApplicableDate(tracker,date)`：按 enabled_from、archived_from、当前版本 active_weekdays 判断；用 `parseDateOnly(date).getUTCDay()`，周日映射 7。月汇总先按 revision_id 分组，再汇总，不能合并不同单位的版本。boolean 的 completed_days 只数 value===true；enum 的分类计数按稳定 ID；recorded_days 包括 0/false；skipped 不计入完成率分母；missing 不算连续成功，也不把非适用日算失败。空数量月 sum=null，已明确录入 0 的月份 sum='0'。

导出 `summarizeHabitDays(days:{date:string;state:CellState;passed:boolean|null}[],today:string,configured:boolean):{streak:number|null;completion_rate:number|null}`，输入按日期升序、已按 revision 分段，数量 passed 由 decimal threshold 判断，boolean passed=value===true。config 有 active_weekdays 或 threshold 时 configured=true；其他类型/未配置时返回两个 null。完成率只按有 recorded 的适用日计算，在 UI 标为“已记录日达标率”，空白不默认为失败；连续值从今天向前数，missing 或明确未达标中断，skipped/不适用略过，未来排除：

```ts
export function summarizeHabitDays(
  days:{date:string;state:CellState;passed:boolean|null}[],today:string,configured:boolean,
) {
  if(!configured)return {streak:null,completion_rate:null}
  const elapsed=days.filter(day=>day.date<=today)
  const recorded=elapsed.filter(day=>day.state==='recorded'&&day.passed!==null)
  const completion_rate=recorded.length
    ? recorded.filter(day=>day.passed===true).length/recorded.length : null
  let streak=0
  for(const day of [...elapsed].reverse()) {
    if(day.state==='not_applicable'||day.state==='skipped')continue
    if(day.state!=='recorded'||day.passed!==true)break
    streak++
  }
  return {streak,completion_rate}
}
```

趋势输出只连接日期相邻且均为 recorded 的两个数值；缺测日没有点，不插值。空月快照 last 为 null；baseline 可单独存在，但不能冒充月末值。图形值转换 Number 前检查 finite；原始字符串保留供详情显示。

- [x] **Step 4: 验证 GREEN。** 同测试命令；补 false、全跳过、归档/启用、只周一/三/五适用、缺测折线断开、不同 revision 不相加，以及乱序来源的测试。
- [x] **Step 5: 提交。** `git add src/lib/journal/aggregate* && git commit -m "feat: calculate journal daily values and metric summaries"`。

## Task 5: 完整月查询与跨日事件投影

**Files:** Create `src/lib/journal/query.ts`, `query.test.ts`, `events.ts`, `events.test.ts`。

- [x] **Step 1: 写月范围、来源移动和重叠事件用例。**

```ts
import { expect,it } from 'vitest'
import { assignEventLanes } from './events'
import type { JournalEventView } from './types'
it('clips cross-month ranges and separates inclusive overlap',()=>{
  const event=(id:string,start:string,end:string):JournalEventView=>({
    event_id:id,title:id,start_date:start,end_date:end,note:'',source:'custom',
    status:'planned',plan_id:null,goal_id:null,progress_record_id:null,version:1,sync_completion:false,
  })
  const lanes=assignEventLanes([
    event('a','2026-08-28','2026-09-03'),
    event('b','2026-09-03','2026-09-05'),
    event('c','2026-09-06','2026-10-02'),
  ],'2026-09')
  expect(lanes[0]).toMatchObject({clipped_start:'2026-09-01',continues_before:true,lane:0})
  expect(lanes[1].lane).toBe(1)
  expect(lanes[2]).toMatchObject({clipped_end:'2026-09-30',continues_after:true,lane:0})
})
```

在 query.test.ts 使用 Prisma mock（沿用 today/query.test.ts 的依赖注入模式）：设 150 条该月进展及一条移入月内的原月份测量，要求全部来源返回；反向移出月份的记录不留在旧格；已安排块只产生 planned event；普通旧文本不填完成格。

- [x] **Step 2: 运行 RED。** `npm test -- src/lib/journal/query.test.ts src/lib/journal/events.test.ts`。
- [x] **Step 3: 实现事件轨道，并装配月查询。**

```ts
import { listMonthDates } from './date'
import type { EventLane,JournalEventView } from './types'
export function assignEventLanes(events:JournalEventView[],month:string):EventLane[] {
  const dates=listMonthDates(month),first=dates[0],last=dates[dates.length-1]
  const ends:string[]=[],result:EventLane[]=[]
  for (const event of events.filter(e=>e.start_date<e.end_date&&e.end_date>=first&&e.start_date<=last)
    .sort((a,b)=>a.start_date.localeCompare(b.start_date)||a.end_date.localeCompare(b.end_date)||a.event_id.localeCompare(b.event_id))) {
    const start=event.start_date<first?first:event.start_date
    const end=event.end_date>last?last:event.end_date
    let lane=ends.findIndex(previousEnd=>previousEnd<start)
    if(lane<0) lane=ends.length
    ends[lane]=end
    result.push({...event,lane,clipped_start:start,clipped_end:end,
      continues_before:event.start_date<first,continues_after:event.end_date>last})
  }
  return result
}
```

`query.ts` 导出 `queryJournalMonth(db,month:string|null,now:Date):Promise<JournalMonthView>` 和 `queryJournalTrackers(db,now:Date):Promise<{list:TrackerView[];timezone:string;today:string}>`。后者供列编辑器与进展字段使用，包含完整 revisions 及归档定义，不返回测量。先读取 PlanningPreference，默认取现有 getDefaultPlanningPreference().timezone；空 month 按 `formatUtcInTimeZone(now,timezone).date.slice(0,7)` 解析本月。以下条件用于一个 RepeatableRead 事务中的批量读取：

```ts
const range=journalMonthRange(resolvedMonth,timezone)
const progressWhere={gmt_create:{gte:range.start,lt:range.endExclusive}}
const measurementWhere={OR:[
  {local_date:{gte:new Date(`${range.first}T00:00:00Z`),lt:new Date(`${range.endDate}T00:00:00Z`)}},
  {origin:'progress_field',progressRecord:progressWhere},
]}
const overlapWhere={
  start_date:{lte:new Date(`${range.last}T00:00:00Z`)},
  end_date:{gte:new Date(`${range.first}T00:00:00Z`)},
}
```

读取定义及 revisions；测量含 live progressRecord；该月所有 ProgressRecord 含 plan；该月 Plan/ActionItem 的 due_date；重叠 ScheduleBlock；重叠 JournalEvent；重叠 FocusPeriod。全部使用月份过滤，不能 take=100 或过滤已归档历史定义。为 ProgressRecord.gmt_create 加索引，确保月份查询不全表扫。

快照 baseline 只在首个当月有效 revision 中查询，不能把旧单位作为新单位的基线。按 revision.config.source 查询该 tracker/revision 最新有效测量：manual 按 local_date<当月首日、recorded_at DESC；progress_field 按 live progressRecord.gmt_create<range.start 排序并要求 source FK 非空；字段来源有 plan 限定时继续限定该 plan。只取一条有效数值，不加载所有历史进展。绑定 plan 删除后 `plan_id===null && plan_name!==null` 是失效绑定，不能误当全计划来源。

逐日选 revision：手动读取 origin=manual 行；field 来源读取同 tracker/revision 的 live 测量；plan 来源对有效完成记录按 ID 去重，boolean 映射 true、quantity 映射十进制 '1'。按 live progress 的发生时间重新映射日期，避开旧 local_date 缓存；已删除来源不参与自动汇总，但留在当天详情的 sources 中。recorded_at 只用于独立手动同日观测排序，不用审计修改时间决定日期。

progress 事件 ID=`progress:${id}`；plan/action 到期 ID=`plan:${plan_id}` / `action:${action_id}`；focus ID=`focus:${period_id}`；schedule ID=`schedule:${block_id}`；自定义沿用 event_id。计划和行动项到期日期用 UTC date-only 格式，不能再做时区平移。FocusPeriod 日期也为 date-only。ScheduleBlock 仅生成“安排”提示，不再造 ProgressRecord 或完成事件；已取消/跳过块不再提示待办。来源文字用纯文本摘要，不把正文当 HTML 注入。自定义事件已引用的完成记录不再另列一个重复 progress 事件，但其原记录仍可在详情编辑。

输出 cells 为 date→tracker_id 映射；summaries 按 tracker/revision，来源详情保留版本号。未来日的自动完成格为 future，只显示计划提示。单日事件保留在 events；多日范围 additionally 进入 lanes，不重复入库。

- [x] **Step 4: 验证 GREEN。** 同测试命令；覆盖 150+ 记录、跨月改期、source 删除、周末、月初基线、跨年 FocusPeriod、重复来源 ID、due_date 在美国时区不前移，以及孤立绑定不扩大查询范围。
- [x] **Step 5: 提交。** `git add src/lib/journal/query* src/lib/journal/events* prisma/schema.prisma && git commit -m "feat: project complete monthly journal with event lanes"`。

## Task 6: 手动格写入、共享完成来源与撤销

**Files:** Create `src/lib/journal/measurement-service.ts`, `measurement-service.test.ts`, `postgres.integration.test.ts`; Modify `completion-link.ts`, `completion-link.test.ts`。

- [x] **Step 1: 写真实 PostgreSQL 的竞争/回滚测试。** `postgres.integration.test.ts` 用 `describe.skipIf(!process.env.JOURNAL_TEST_DATABASE_URL)`；仅在 beforeAll 创建 `new PrismaClient({datasourceUrl:process.env.JOURNAL_TEST_DATABASE_URL})`，不在缺少变量时回落到正式 DATABASE_URL。每例生成独立 UUID 前缀，建立一个 recurring Plan、两个关联的 boolean/manual tracker，配置 sync_completion=true。

核心断言：

```ts
const first={tracker_id:trackers[0].tracker_id,date:'2026-09-12',expected_version:0,
  value:true,status:'recorded' as const,note:'运动',request_id:crypto.randomUUID()}
const second={...first,tracker_id:trackers[1].tracker_id,request_id:crypto.randomUUID()}
await Promise.all([putManualMeasurement(db,first),putManualMeasurement(db,second)])
expect(await db.progressRecord.count({where:{plan_id:plan.plan_id}})).toBe(1)
const row=await db.trackerMeasurement.findFirstOrThrow({where:{tracker_id:first.tracker_id}})
await putManualMeasurement(db,{...first,value:null,status:'cleared',expected_version:row.version,request_id:crypto.randomUUID()})
expect(await db.progressRecord.count({where:{plan_id:plan.plan_id}})).toBe(1)
```

这里 db、plan、trackers 由 beforeAll/beforeEach 的专用测试库种子提供；seed 使用 `createTracker` 的完整配置对象，按 types.ts 的 TrackerConfig 字段填写。后续撤销第二格后要求 count=0；若原先有非手账创建的有效进展，要求它仍在且不新增。服务单测用 mock 模拟关联进展创建失败，要求整个 measurement 写入回滚。

- [x] **Step 2: 运行 RED。** `npm test -- src/lib/journal/measurement-service.test.ts src/lib/journal/completion-link.test.ts`；真实数据库连接准备后单独运行 integration 文件，初始缺失函数失败。
- [x] **Step 3: 实现统一写入和完成链接。**

`measurement-service.ts` 导出 `putManualMeasurement(db,input:PutMeasurementInput):Promise<MeasurementView>`、`clearMeasurement(db,input):Promise<MeasurementView>`、`saveProgressMetrics(tx,record,metrics:ProgressMetricInput[])`。第三个方法接受现有事务，不自行嵌套事务；只为 progress_field revision 创建/更新来源行，唯一键是 tracker_id + progress_record_id。

手动写入事务的顺序：严格解析 → 读取所需 plan_id → 锁 Plan → 锁 TrackerDefinition → 重读 revision/plan 归属 → 确认本地日期/启用/归档/不是未来实际记录 → 查手动行 → 识别相同 request_id、相同载荷的重放 → expected_version 校验 → 写测量 → 关联/释放完成来源 → 返回新版本。Plan 锁在 Tracker 锁之前，配置关联变更也遵循同一顺序；所有多 tracker 写入按 tracker_id 排序，避免逆序锁。

锁与冲突核心：

```ts
await tx.$queryRaw`SELECT "plan_id" FROM "Plan" WHERE "plan_id"=${planId} FOR UPDATE`
await tx.$queryRaw`SELECT "tracker_id" FROM "TrackerDefinition" WHERE "tracker_id"=${input.tracker_id} FOR UPDATE`
const existing=await tx.trackerMeasurement.findFirst({where:{
  tracker_id:input.tracker_id,origin:'manual',local_date:new Date(`${input.date}T00:00:00Z`),
}})
if ((existing?.version??0)!==input.expected_version) {
  throw new JournalError('STALE_VERSION','这个格子已变化，请重新读取')
}
```

planId 为锁前读取的 revision.plan_id；为空时跳过 Plan 锁。取得 Tracker 锁后再次比较该 planId 与实际 revision，发生变化返回 SOURCE_CHANGED，而不是持锁后再按逆序追加新 Plan 锁。重复 request_id 的相同请求返回既有行；同键不同载荷返回 409。

`completion-link.ts` 增加 `linkCellCompletion(tx,measurement,revision,date,timezone)` 与 `releaseCellCompletion(tx,measurement)`。只在 boolean=true 或 quantity>=threshold 且 sync_completion 开启时执行链接。先找当天该 Plan 已有有效完成；有则复用；没有则创建以下拥有明确所有权的来源：

```ts
const key=`cell:${planId}:${date}`
const record=await tx.progressRecord.create({data:{
  plan_id:planId,journal_completion_key:key,outcome:'completed',counts_toward_recurrence:true,
  content:`${trackerName}：已完成`,thinking:'',
  gmt_create:zonedMinuteToUtc(date,12*60,timezone),
}})
await tx.trackerMeasurement.update({where:{measurement_id:measurementId},data:{
  progress_record_id:record.id,source_record_id:record.id,
}})
```

planId/date/timezone/trackerName/measurementId 从已锁定数据和参数取得，不由客户端指定 completion_key。找已有记录必须使用 Task 1 判定，不能把部分完成/普通旧文本当有效完成。唯一 journal_completion_key 与 Plan 锁共同避免并发重复；不要用 upsert 空 update 绕开载荷/版本检查。

撤销先将本格 status=cleared、三种值清空并释放 FK，版本递增；只在原 ProgressRecord.journal_completion_key 为该 cell key、且没有其他有效 measurement/JournalEvent 引用时删除。非手账拥有的来源绝不删除；部分撤销保留被其他格共享的来源。numeric/snapshot/enum 默认 counts 不增加。所有操作用同一个事务，不能先保存格子再向第二个 API 创建进展。

- [x] **Step 4: 验证。** 运行服务单测与真实库集成；检查 false/0、重复点击、相同请求重试、两个列并发、编辑冲突、事务异常回滚、清空后恢复、已有外部完成、已删除 plan 和 threshold 跨过/撤回。
- [x] **Step 5: 提交。** `git add src/lib/journal/measurement-service* src/lib/journal/completion-link* src/lib/journal/postgres.integration.test.ts && git commit -m "feat: save journal cells without duplicate plan completions"`。

## Task 7: 进展结构化字段与自定义事件事务

**Files:** Create `src/lib/progress-record-service.ts`, `src/lib/progress-record-service.test.ts`, `src/lib/journal/event-service.ts`, `event-service.test.ts`; Modify `src/app/api/progress_record/route.ts`; Create `src/app/api/progress_record/route.test.ts`。

- [x] **Step 1: 写现有 API 兼容和联动用例。** 原 GET 的 list/total 与 plan_id 分页保持；新 POST 接受 metrics 和 outcome；新 PUT 接受 expected_version；source 记录改期后新月出现、旧月消失；DELETE 后测量保留且源 FK 为 null。metrics-only 新记录默认不计次；明确 completed 才计次；不带新字段的 legacy POST 保持现有 recurrence 语义。

```ts
const record=await createProgressRecord(db,{
  plan_id:planId,content:'记录今日播放',thinking:'',
  custom_time:'2026-09-12T20:00',
  metrics:[{tracker_id:viewsTrackerId,revision_id:viewsRevisionId,value:'1250',status:'recorded',note:''}],
})
expect(record.counts_toward_recurrence).toBe(false)
expect(record.metrics[0].value).toBe('1250')
await updateProgressRecord(db,{id:record.id,expected_version:record.version,
  content:record.content,thinking:record.thinking,custom_time:'2026-10-01T08:00'})
expect((await queryJournalMonth(db,'2026-09',new Date('2026-10-05'))).cells['2026-09-12'][viewsTrackerId].value).toBe(null)
expect((await queryJournalMonth(db,'2026-10',new Date('2026-10-05'))).cells['2026-10-01'][viewsTrackerId].value).toBe('1250')
```

服务单测中的 db/planId/viewsTrackerId/viewsRevisionId 用 beforeEach 的明确 mock/fixture 建立；真实改期与 FK 保留断言放入 Task 6 的独立数据库集成套件。

- [x] **Step 2: 运行 RED。** `npm test -- src/lib/progress-record-service.test.ts src/app/api/progress_record/route.test.ts src/lib/journal/event-service.test.ts`。
- [x] **Step 3: 集中进展写入，补事件服务。**

`progress-record-service.ts` 导出 `createProgressRecord(db,input:ProgressWriteInput):Promise<ProgressRecordView>`、`updateProgressRecord(db,input:ProgressUpdateInput):Promise<ProgressRecordView>`、`deleteProgressRecord(db,input:{id:number;expected_version?:number}):Promise<void>`。沿用原 plan_id/content/thinking/custom_time 字段，但本地 datetime 必须使用用户 PlanningPreference 时区的 zonedMinuteToUtc，带偏移 ISO 用 Date。`metrics` 缺席表示保留已有字段；`metrics:[]` 表示显式清空该记录所有测量，既有行变 cleared，不级联删除历史值；提交的列表是该记录结构化字段的完整当前集合。新客户端提供 request_id；POST 按 journal_request_id 查同载荷重放，避免网络失败后重复创建；legacy 调用可缺省。

一笔事务创建/更新 ProgressRecord 和 `saveProgressMetrics`；按发生日期选 revision。配置是 progress_field 且绑定匹配当前 plan 才能写，记录输入不能越过 tracker 启用/归档日期。字段值需通过 parseJournalValue；bounds、status 和 decimal 精度检查复用 Task 3。含 schedule_block_id 来源时禁止改 plan 归属与 outcome，结果仍由现有 completion-service 管理；只允许内容、思考、发生时间及结构化字段编辑。显式传入 plan_progress 时在同一事务更新 Plan.progress：只允许普通计划、有限数值 0–1；未提供时绝不改进度。原进展页的 progress_update 映射成此字段，取消第二次独立 Plan PUT，防止部分成功。

计次计算分支：

```ts
const countsTowardRecurrence = input.outcome !== undefined
  ? input.outcome === 'completed'
  : input.metrics !== undefined ? false : true
```

该分支只用于创建；更新时 outcome/metrics 未提供的字段必须保持原值，不能因为加了测量而抹掉原 completed 状态。已有 legacy PUT 未提供 expected_version 时，在锁定当前记录后沿用其版本实现兼容；新页面与月度来源编辑必须提交 expected_version，实现 409 冲突检测。所有更新使 version 加 1。DELETE 通过 FK SetNull 保留独立测量，不能删除同 plan 同日其他进展。

改期但 metrics 缺席时也要核对每个既有测量的目标日期 revision：语义完全相同可重绑日期与 revision；单位、来源、适用或枚举定义变化则返回 SOURCE_CHANGED 并回滚，提示用户在目标日期重新确认字段，不默默换单位。改 plan 同样核对所有字段绑定。手动测量的日期/值继续以自己的原始记录为准；其引用来源被改期/删除时，自动完成列重算，手动格详情标注关联已变化，不偷偷改用户原值。

`event-service.ts` 导出 `createJournalEvent(db,input:JournalEventInput):Promise<JournalEventView>`、`updateJournalEvent(db,input:JournalEventUpdateInput):Promise<JournalEventView>`、`deleteJournalEvent(db,input:{event_id:string;expected_version:number}):Promise<void>`。sync_completion 独立持久化，编辑时读回。只在用户明确 sync_completion=true 且 status=completed 时创建或更新来源，key=`event:${event_id}`；不把同一天独立实际事件合并成一次。重试同 request_id 不重复创建事件或进展。撤销/删除只释放本事件拥有的来源，保留非拥有来源和其他引用。完成日期取 end_date 的用户时区中午；未来日期只可 planned，不接受 completed。

JournalEvent.request_id 是不可变的新建幂等键，编辑不能覆盖它；更新/删除用 expected_version 阻止重复应用，若上次操作已成功而响应丢失，客户端重读确认。ProgressRecord.journal_request_id 同样保留新建键，服务不允许借更新记录释放原键。

原 progress API GET 新增 `id` 参数返回单条含 metrics/source/version 的记录，其余 list/total 契约不变。POST/PUT/DELETE 调服务，领域错误统一 400/404/409；异常 500 返回简短失败消息。source 编辑从月度页使用该 id 查询和同一个 PUT，不另造一份编辑 API。

- [x] **Step 4: 验证 GREEN。** 同命令及专库集成；涵盖明确 0、分类稳定 ID、metrics 缺席/清空、普通/周期计划旧记录、带偏移 ISO、本地 DST 无效时间、source record plan 变更限制、重复事件请求、撤销时引用保留和 plan.progress 未被自动修改。
- [x] **Step 5: 提交。** `git add src/lib/progress-record-service* src/lib/journal/event-service* src/app/api/progress_record && git commit -m "feat: share structured progress and journal event transactions"`。

## Task 8: HTTP 契约、认证与错误响应

**Files:** Create `src/lib/journal/http.ts`, `http.test.ts`, `src/app/api/journal/month/route.ts`, `trackers/route.ts`, `measurements/route.ts`, `events/route.ts` 及各自 `route.test.ts`；Modify `src/app/api/progress_record/route.ts`。

- [x] **Step 1: 写路由行为测试。** 使用 `vi.mock('@/lib/auth')`、Prisma 和各服务 mock，向导出的 handler 传真实 NextRequest。每个路由至少验证未登录 401 且服务没运行、格式错误 400；测量写入验证原样交给服务并返回新版本；冲突保留 409。

```ts
import { NextRequest } from 'next/server'
import { expect,it,vi } from 'vitest'
import { getCurrentUser } from '@/lib/auth'
import { PUT } from './route'
import { putManualMeasurement } from '@/lib/journal/measurement-service'
import { JournalError } from '@/lib/journal/types'
vi.mock('@/lib/auth',()=>({getCurrentUser:vi.fn()}))
vi.mock('@/lib/journal/measurement-service',()=>({
  putManualMeasurement:vi.fn(),clearMeasurement:vi.fn(),
}))
it('returns a version conflict without reporting a successful save',async()=>{
  vi.mocked(getCurrentUser).mockResolvedValue({username:'test'})
  vi.mocked(putManualMeasurement).mockRejectedValue(new JournalError('STALE_VERSION','这个格子已变化'))
  const request=new NextRequest('http://localhost/api/journal/measurements',{
    method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({tracker_id:'tracker-1',date:'2026-09-12',expected_version:2,
      value:false,status:'recorded',note:'',request_id:'6b41b5ea-0f66-4a64-a72a-4cb2f39fcfc3'}),
  })
  const response=await PUT(request)
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({error:'这个格子已变化',code:'STALE_VERSION'})
})
```

- [x] **Step 2: 运行 RED。** `npm test -- src/lib/journal/http.test.ts src/app/api/journal`，预期缺少新路由失败。
- [x] **Step 3: 实现统一 wrapper 和输入边界。**

```ts
// src/lib/journal/http.ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { JournalError } from './types'
export async function journalHttp(run:()=>Promise<unknown>,status=200) {
  if (!await getCurrentUser()) return NextResponse.json({error:'请先登录'},{status:401})
  try { return NextResponse.json(await run(),{status}) }
  catch(error) {
    if(error instanceof JournalError) {
      const status=error.code==='VALIDATION'?400:error.code==='NOT_FOUND'?404:409
      return NextResponse.json({error:error.message,code:error.code},{status})
    }
    console.error('journal request failed',error)
    return NextResponse.json({error:'手账请求失败，请重试'},{status:500})
  }
}
export async function journalJson(req:Request):Promise<unknown> {
  try { return await req.json() }
  catch { throw new JournalError('VALIDATION','请求必须是有效 JSON') }
}
```

PrismaClient 沿用相邻 API 的实例方式，每个路由在模块顶部初始化，测试 mock 构造器。month GET 将 searchParams.get('month') 交给 queryJournalMonth；month 无效格式必须转换成 JournalError，不能让日期函数的普通 Error 变成 500。

measurements PUT 的路由主体：

```ts
export async function PUT(req:NextRequest) {
  return journalHttp(async()=>putManualMeasurement(prisma,parseMeasurementInput(await journalJson(req))))
}
```

`validation.ts` 增加并导出 `parseMeasurementInput(unknown):PutMeasurementInput`、`parseTrackerCreate(unknown):TrackerCreateInput`、`parseTrackerMutation(unknown):TrackerMutation`、`parseEventInput(unknown):JournalEventInput`、`parseEventUpdate(unknown):JournalEventUpdateInput`、`parseProgressDelete(URLSearchParams):{id:number;expected_version?:number}`、`parseEventDelete(URLSearchParams):{event_id:string;expected_version:number}`。`TrackerMutation` 是 TrackerUpdateInput 加 `{action:'reorder'} & TrackerOrderInput`、`{action:'archive'} & TrackerArchiveInput` 的联合，放在 types.ts。解析拒绝未知字段；expected_version 为整数，新增格允许 0，其余修改 >=1；request_id 为 UUID；值类型在服务取得 tracker.kind 后再校验。

固定接口如下，客户端和测试按同一表实现：

| 路由 | 方法与输入 | 成功响应 |
| --- | --- | --- |
| `/api/journal/month` | GET `?month=YYYY-MM`，缺省本月 | JournalMonthView |
| `/api/journal/trackers` | GET | `{list:TrackerView[],timezone,today}` |
| 同上 | POST TrackerCreateInput | TrackerView，201 |
| 同上 | PUT TrackerMutation，action 为 display/revise/reorder/archive | TrackerView 或 TrackerView[] |
| `/api/journal/measurements` | PUT PutMeasurementInput | MeasurementView |
| 同上 | DELETE `?tracker_id=…&date=…&expected_version=…&request_id=…` | cleared MeasurementView |
| `/api/journal/events` | POST JournalEventInput | JournalEventView，201 |
| 同上 | PUT JournalEventUpdateInput | JournalEventView |
| 同上 | DELETE `?event_id=…&expected_version=…` | `{success:true}` |
| `/api/progress_record` | GET `?id=整数` | ProgressRecordView |
| 同上 | POST ProgressWriteInput / PUT ProgressUpdateInput | ProgressRecordView |
| 同上 | DELETE `?id=…&expected_version=…` | `{success:true}` |

`clearMeasurement` 将 DELETE 参数转成 value=null/status=cleared/note='' 后调用同一测量服务，不创建另一套版本规则。自动来源的 PUT 不走 measurements；编辑已有来源走 progress_record PUT，新增字段来源走 progress_record POST。原进展 list/total GET 保留；只有新单条读取和写入接入统一错误/auth wrapper。

- [x] **Step 4: 验证 GREEN。** 运行 Step 2 命令及 progress_record/route.test.ts；核对坏 JSON、负版本、未知 action、未知列、已归档日期、幂等重放和 500 不泄漏原异常内容。`npx tsc --noEmit` 通过。
- [x] **Step 5: 提交。** `git add src/lib/journal/http* src/lib/journal/validation* src/app/api/journal src/app/api/progress_record && git commit -m "feat: expose authenticated monthly journal APIs"`。

## Task 9: 客户端刷新和月份查询生命周期

**Files:** Create `src/lib/journal/client.ts`, `client.test.ts`, `src/components/journal/use-journal-month.ts`, `use-journal-month.behavior.test.tsx`。

- [x] **Step 1: 写请求竞争测试。** 两个月份请求按相反顺序返回，最终只呈现后选月份；卸载不 setState；shared data-changed 和窗口 focus 触发刷新；失败有 error，不变成空月。

```tsx
// @vitest-environment jsdom
import { act,renderHook,waitFor } from '@testing-library/react'
import { expect,it,vi } from 'vitest'
import { useJournalMonth } from './use-journal-month'
import { journalRequest } from '@/lib/journal/client'
import type { JournalMonthView } from '@/lib/journal/types'
vi.mock('@/lib/journal/client',()=>({journalRequest:vi.fn()}))
it('ignores an old month response even if fetch ignores abort',async()=>{
  let resolveSeptember!:(value:JournalMonthView)=>void
  let resolveOctober!:(value:JournalMonthView)=>void
  vi.mocked(journalRequest)
    .mockImplementationOnce(()=>new Promise(resolve=>{resolveSeptember=resolve}))
    .mockImplementationOnce(()=>new Promise(resolve=>{resolveOctober=resolve}))
  const view=(month:string):JournalMonthView=>({month,timezone:'Asia/Shanghai',today:'2026-09-27',
    dates:[],trackers:[],cells:{},events:[],lanes:[],summaries:[]})
  const hook=renderHook(({month})=>useJournalMonth(month),{initialProps:{month:'2026-09'}})
  hook.rerender({month:'2026-10'})
  await act(async()=>{resolveOctober(view('2026-10'))})
  await act(async()=>{resolveSeptember(view('2026-09'))})
  await waitFor(()=>expect(hook.result.current.data?.month).toBe('2026-10'))
})
```

- [x] **Step 2: 运行 RED。** `npm test -- src/lib/journal/client.test.ts src/components/journal/use-journal-month.behavior.test.tsx`。
- [x] **Step 3: 实现请求与生命周期。**

```ts
// client.ts
import { refreshQuadrantSidebar } from '@/lib/utils'
export class JournalRequestError extends Error {
  constructor(public status:number,public code:string|undefined,message:string){super(message)}
}
export async function journalRequest<T>(url:string,init:RequestInit={}):Promise<T> {
  const response=await fetch(url,{...init,headers:{'Content-Type':'application/json',...init.headers}})
  const body=await response.json()
  if(!response.ok) throw new JournalRequestError(response.status,body.code,body.error??'请求失败，请重试')
  return body as T
}
export function notifyJournalChanged(detail:{entity:'journal'|'progress-record';date?:string}) {
  window.dispatchEvent(new CustomEvent('goal-mate:data-changed',{detail}))
  refreshQuadrantSidebar()
}
```

```tsx
// use-journal-month.ts
'use client'
import { useCallback,useEffect,useState } from 'react'
import { journalRequest } from '@/lib/journal/client'
import type { JournalMonthView } from '@/lib/journal/types'
export function useJournalMonth(month:string|null) {
  const [data,setData]=useState<JournalMonthView|null>(null)
  const [error,setError]=useState<string|null>(null)
  const [loading,setLoading]=useState(true)
  const [revision,setRevision]=useState(0)
  const reload=useCallback(()=>setRevision(value=>value+1),[])
  useEffect(()=>{
    window.addEventListener('goal-mate:data-changed',reload)
    window.addEventListener('focus',reload)
    return()=>{
      window.removeEventListener('goal-mate:data-changed',reload)
      window.removeEventListener('focus',reload)
    }
  },[reload])
  useEffect(()=>{
    const controller=new AbortController()
    let current=true
    setLoading(true);setError(null)
    const query=month?`?month=${encodeURIComponent(month)}`:''
    journalRequest<JournalMonthView>(`/api/journal/month${query}`,{signal:controller.signal})
      .then(value=>{if(current)setData(value)})
      .catch(error=>{if(current&&error?.name!=='AbortError')setError('加载手账失败，请重试')})
      .finally(()=>{if(current)setLoading(false)})
    return()=>{current=false;controller.abort()}
  },[month,revision])
  return {data,error,loading,reload}
}
```

新月份加载时，旧 data 只有在 data.month 匹配当前选中 month 时可编辑；保留旧画面只用作明确标为加载中的预览。月份初始 null 等服务解析用户时区本月。每个保存操作只在 response.ok 后 notify；不在 finally 中发送成功事件。401 显示重新登录入口；409 保留编辑器输入、提供“读取最新来源”，不能自动覆盖。

- [x] **Step 4: 验证 GREEN。** 同命令；增加请求失败不通知、0/false 请求体原样保存、abort 无错误提示、冲突保留输入测试。
- [x] **Step 5: 提交。** `git add src/lib/journal/client* src/components/journal/use-journal-month* && git commit -m "feat: keep journal views synchronized with shared data changes"`。

## Task 10: 页面入口、月表和可访问格子

**Files:** Create `src/app/journal/page.tsx`, `src/components/journal/monthly-journal.tsx`, `journal-sheet.tsx`, `journal-sheet.module.css`, `journal-cell.tsx`, `monthly-journal.behavior.test.tsx`, `journal-cell.behavior.test.tsx`; Modify `src/components/app-header.tsx`, `main-layout.tsx`, `main-layout.test.tsx`。

- [x] **Step 1: 写用户可见行为测试。** mock useJournalMonth 返回完整九月 DTO；断言 30 个日期按钮、名称为“2026-09-12 运动：未记录”的格子按钮、明确 false/0/skipped 状态、空月份引导、导航“手账”。MainLayout 添加默认收起测试，同时保留现有默认展开行为。

```tsx
// journal-cell.behavior.test.tsx
// @vitest-environment jsdom
import { fireEvent,render,screen } from '@testing-library/react'
import { expect,it,vi } from 'vitest'
import { JournalCell } from './journal-cell'
it('announces false instead of treating it as an empty cell',()=>{
  const onOpen=vi.fn()
  render(<JournalCell name="运动" kind="boolean" color="#b6d99d"
    config={{unit:'',source:'manual',daily_aggregation:'any',encoding:'fill',units_per_cell:'1',
      threshold:null,minimum:null,maximum:null,sync_completion:false,active_weekdays:[],enum_options:[]}}
    cell={{tracker_id:'t',date:'2026-09-12',revision_id:'r',state:'recorded',value:false,
      sources:[],measurement_id:'m',version:1}} onOpen={onOpen} />)
  fireEvent.click(screen.getByRole('button',{name:'2026-09-12 运动：未完成'}))
  expect(onOpen).toHaveBeenCalledOnce()
  expect(screen.getByText('×')).toBeTruthy()
})
```

- [x] **Step 2: 运行 RED。** `npm test -- src/components/journal/monthly-journal.behavior.test.tsx src/components/journal/journal-cell.behavior.test.tsx src/components/main-layout.test.tsx`。
- [x] **Step 3: 接入口和外壳。**

MainLayoutProps 增加 `initialSidebarState?:'open'|'closed'`，解构默认 open，两处 useState 改为 `useState(initialSidebarState==='open')`；收起 aside 加 inert 与 aria-hidden，防止 Tab 进入零宽度隐藏内容。不按 pathname 隐式改旧页面。AppHeader navigation 在进展之后增加 `{href:'/journal',label:'手账'}`。

```tsx
// src/app/journal/page.tsx
import { Suspense } from 'react'
import AuthGuard from '@/components/AuthGuard'
import { MainLayout } from '@/components/main-layout'
import { MonthlyJournal } from '@/components/journal/monthly-journal'
export default function JournalPage() {
  return <AuthGuard><MainLayout initialSidebarState="closed">
    <Suspense fallback={<p role="status" className="p-6">正在加载手账…</p>}>
      <MonthlyJournal />
    </Suspense>
  </MainLayout></AuthGuard>
}
```

- [x] **Step 4: 实现网格与类型表达。** `JournalSheet` props 为 `{view:JournalMonthView;group:string|null;onCell:(cell:JournalCell)=>void;onTracker:(tracker:TrackerView)=>void;onDate:(date:string)=>void;onEvent:(event:JournalEventView)=>void}`。所有 row 使用同一 CSS 网格列；列头、日期与格子都是语义按钮；多日轨道按 day index + CSS grid-row 起止在同一日期轴排列。

```css
/* journal-sheet.module.css */
.sheet { --row-size:34px; --tracker-size:84px; position:relative; min-width:0;
  color:#292d27; background-color:#fafbf6;
  background-image:radial-gradient(#59634b26 .7px,transparent .7px); background-size:12px 12px; }
.scroll { overflow-x:auto; overscroll-behavior-x:contain; }
.row { display:grid; grid-template-columns:var(--tracker-columns) 44px minmax(180px,1fr) var(--lane-columns);
  min-height:var(--row-size); border-bottom:1px solid #59634b20; }
.date { position:sticky; left:0; z-index:2; background:#fafbf6; font-variant-numeric:tabular-nums; }
.cell { min-width:0; min-height:var(--row-size); border-right:1px solid #59634b12; }
.cell:focus-visible { outline:2px solid #596b48; outline-offset:-2px; }
.weekStart { border-top:1px solid #59634b45; }
.today { background-color:#e5eddb70; }
@media (max-width:736px) { .sheet { --row-size:44px; --tracker-size:72px; } }
@media (pointer:coarse) { .sheet { --row-size:44px; } }
```

`--tracker-columns` 是可见列数的 `repeat(n,var(--tracker-size))`，无列时 `0px`；轨道区域列数由 lanes 决定，最多直接显示三条轨道，其余当天显示“另 N 个区间”，详情包含全部。窄屏组内列超过三列时提供上一组列/下一组列，每页最多三列，所有列都可到达；桌面可切组或横向滚动，不能对原列表 slice 后丢弃剩余列。列标题与日期轴在自身滚动容器固定，表格可纵向滚动满月。

`JournalCell` props 与 Step 1 一致。missing 显示留白且 label=未记录；false 显示 ×；true 显示填色及 ✓；0 显示 0；skipped 显示 —；不适用/未来显示柔和占位、禁止快速写实际值但可看详情。数字保留原字符串；blocks 按 units_per_cell 显示完整/部分小格并标明原值；heat 同时显示数字；enum 按稳定 ID 找 label/symbol。snapshot 的 line 在列范围 SVG 中绘制，相邻 recorded 日期才连线，每点仍对应可访问日期按钮；不用单色传达状态。

`MonthlyJournal` 控制 month、group、列分页、选中列摘要和编辑器状态。月份前后用 date-only 加月份，URL `?month=YYYY-MM` 同步；“本月”设置 null 并让服务按 preference 时区解析。空月允许加列/加事件，空数据提示不能用演示值填充。顶部只保留月份、前后、本月、添加列/事件；摘要根据选中列显示类型化统计。

- [x] **Step 5: 验证 GREEN。** 同测试命令；补闰月、month loading 不能改旧格、超过三列可翻到第四列、记录数不丢失、区间点击、键盘 Enter/Space。现有 MainLayout 所有测试通过。
- [x] **Step 6: 提交。** `git add src/app/journal src/components/journal src/components/app-header.tsx src/components/main-layout* && git commit -m "feat: render journal month with configurable daily cells"`。

## Task 11: 列配置、格子和当天事件编辑器

**Files:** Create `src/components/journal/tracker-editor.tsx`, `cell-editor.tsx`, `day-detail.tsx`, `event-editor.tsx`, `editors.behavior.test.tsx`; Modify `monthly-journal.tsx`, `journal-sheet.tsx`。

- [x] **Step 1: 写完整保存与失败保留用例。** Testing Library 操作新建列、输入数量 0、false、跳过、归档、修改原进展、跨月事件。断言请求体的原值、request_id 和 expected_version，不仅断言函数是否调用。

```tsx
// @vitest-environment jsdom
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { expect,it,vi } from 'vitest'
import { CellEditor } from './cell-editor'
import { journalRequest } from '@/lib/journal/client'
import type { TrackerView } from '@/lib/journal/types'
vi.mock('@/lib/journal/client',()=>({journalRequest:vi.fn(),notifyJournalChanged:vi.fn()}))
it('keeps a zero input available after a failed save',async()=>{
  vi.mocked(journalRequest).mockRejectedValue(new Error('offline'))
  const tracker:TrackerView={tracker_id:'t',name:'播放量',kind:'quantity',group:'自媒体',color:'#b6d99d',
    position:0,version:1,enabled_from:'2026-09-01',archived_from:null,revisions:[{
      revision_id:'r',effective_from:'2026-09-01',plan_id:null,plan_name:null,goal_id:null,goal_name:null,
      config:{unit:'次',source:'manual',daily_aggregation:'sum',encoding:'number',units_per_cell:'1000',
        threshold:null,minimum:'0',maximum:null,sync_completion:false,active_weekdays:[],enum_options:[]},
    }]}
  render(<CellEditor tracker={tracker} date="2026-09-12" timezone="Asia/Shanghai" today="2026-09-27"
    cell={{tracker_id:'t',date:'2026-09-12',revision_id:'r',state:'missing',value:null,
      sources:[],measurement_id:null,version:0}} onClose={vi.fn()} onSaved={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('播放量'),{target:{value:'0'}})
  fireEvent.click(screen.getByRole('button',{name:'保存'}))
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('保存失败'))
  expect((screen.getByLabelText('播放量') as HTMLInputElement).value).toBe('0')
})
```

- [x] **Step 2: 运行 RED。** `npm test -- src/components/journal/editors.behavior.test.tsx`。
- [x] **Step 3: 明确编辑状态与请求生命周期。**

```ts
type JournalEditor =
  | {kind:'none'} | {kind:'tracker';tracker:TrackerView|null}
  | {kind:'cell';tracker:TrackerView;cell:JournalCell}
  | {kind:'day';date:string} | {kind:'event';date:string;event:JournalEventView|null}
```

以上类型在 monthly-journal.tsx 定义，父组件只保持一个打开的编辑器。复用现有 `src/components/today/use-modal-accessibility.ts` 的 useModalAccessibility，采用 schedule-block-editor.tsx 的遮罩/section 模式；不引入不存在的 Dialog 组件或新依赖。每个 section 使用 role=dialog、aria-modal=true、唯一 aria-labelledby、tabIndex=-1，并把 modalRef 绑到 section，首个输入 ref 传 initialFocusRef，saving 传 loading。这样共享背景 inert、焦点锁、Escape 和焦点归还。保存中禁用重复操作；请求失败保留所有输入，已成功的实际数据不做假回滚。手动 boolean 格点击快速 true/false 写入并给“撤销”按钮；自动 boolean 格点击先显示来源，不生成第二份值。成功后 notifyJournalChanged 并重读月份；撤销用返回版本提交 cleared 或之前明确值。

每个编辑器在开始一次新写入时生成 UUID；网络失败重试沿用同一个 request_id，用户改变载荷后才新建 UUID。重试按钮不能每次新键。保存业务骨架如下，放在 CellEditor 的 submit 内：

```ts
try {
  setSaving(true);setError(null)
  const result=await journalRequest<MeasurementView>('/api/journal/measurements',{
    method:'PUT',body:JSON.stringify({tracker_id:tracker.tracker_id,date,expected_version:cell.version,
      value,status,note,request_id:requestId}),
  })
  notifyJournalChanged({entity:'journal',date})
  onSaved(result)
} catch(error) {
  setError(error instanceof JournalRequestError && error.status===409
    ? '这个格子已被修改。读取最新数据后再保存；当前输入已保留。'
    : '保存失败，请重试。当前输入已保留。')
} finally {setSaving(false)}
```

- [x] **Step 4: 配置与编辑器逐项接通。**

TrackerEditor 接收 `{tracker:TrackerView|null;today:string;onClose:()=>void;onSaved:()=>void}`，读取 tracker GET、plan GET/pageSize1000 和 goal GET。四种起点使用 types.ts 的完整默认 config；空白自定义也由用户选类型。表单提供来源、可选计划/目标、适用星期、单位、编码、小格单位、范围/阈值和同步完成；按 type/source 显示相关项，样例日解释一格含义。类型有已存数据时不可更改；首版直接禁止创建后改 kind，替换提示新建列。显示设置和语义版本分别保存；新语义日期默认下月首日且不能追溯覆盖已用版本；归档采用 today。枚举修改标签保持原 ID。列顺序使用上移/下移按钮发送完整 ids 和 expected_versions，无需再建一套拖拽。

CellEditor 使用 Step 1 props：manual 列显示原生文本数字输入（inputMode=decimal，value 为 string），boolean 两项，enum 选项稳定 ID，备注，跳过/清空。source=plan 显示完成进展列表与原记录入口；新完成必须选择已有 plan 并明确 outcome=completed。source=progress_field 先选一条已有来源或新建进展；未绑定 plan 时需要选择 plan，因为 ProgressRecord.plan_id 必填。保存已有来源先 GET id，保留该记录其他 metrics，替换当前 tracker 的值后 PUT；创建用 POST metrics+custom_time，本地日期默认中午、counts 默认不计次。同步开关/关联失效须文字说明。

DayDetail 接收 `{date:string;view:JournalMonthView;onCell;onEvent;onClose}`；完整展示当日所有测量（含 orphan 来源）、进展摘要、到期项、安排、覆盖当天的区间和来源标识。记录详情提供 `/progress?plan_id=…&record_id=…`；计划/行动项沿用现有 plans 入口；FocusPeriod 沿用其现有编辑入口，不在这里复制编辑。单日摘要截断只影响表格，详情必须展示全部。

EventEditor 接收 `{date:string;event:JournalEventView|null;today:string;onClose;onSaved}`。字段按 JournalEventInput；仅自定义 source 可编辑，其他展示原入口。日期可跨月；同步完成开关只有关联 plan 时可开启；未来 actual completed 保存被客户端和服务两处拒绝。保存/删除使用 event.version；取消完成也不删除当天其他记录。

- [x] **Step 5: 验证 GREEN。** 同命令；补自动来源只走 progress_record、现有其他 metrics 被保留、409 不关闭、重复重试同键、修改载荷换键、删除来源标记、所有事件可展开、Dialog 键盘焦点与手机输入。
- [x] **Step 6: 提交。** `git add src/components/journal && git commit -m "feat: edit journal trackers values and dated events"`。

## Task 12: 进展页联动与发布前验收

**Files:** Create `src/components/journal/progress-metric-fields.tsx`, `progress-metric-fields.behavior.test.tsx`, `src/app/progress/page.behavior.test.tsx`; Modify `src/app/progress/page.tsx`, `src/lib/journal/postgres.integration.test.ts`, `docs/superpowers/specs/2026-09-27-monthly-journal-design.md` 的实现状态。

- [x] **Step 1: 写进展页跨入口用例。** `?record_id=…` 单条查询必须能编辑 100 条列表以外的原记录；数量 0 正确提交；选 plan/date 后只显示匹配的 progress_field 列；explicit percent 与 metric 同一请求；成功发共享刷新、失败保留输入。

```tsx
// @vitest-environment jsdom
import { fireEvent,render,screen } from '@testing-library/react'
import { expect,it,vi } from 'vitest'
import { ProgressMetricFields } from './progress-metric-fields'
import type { TrackerView } from '@/lib/journal/types'
it('emits a typed numeric zero without turning it into a missing value',()=>{
  const onChange=vi.fn()
  const trackers:TrackerView[]=[{tracker_id:'views',name:'播放量',kind:'quantity',group:'自媒体',
    color:'#b6d99d',position:0,version:1,enabled_from:'2026-09-01',archived_from:null,revisions:[{
      revision_id:'views-r',effective_from:'2026-09-01',plan_id:'p',plan_name:'自媒体',goal_id:null,goal_name:null,
      config:{unit:'次',source:'progress_field',daily_aggregation:'sum',encoding:'number',units_per_cell:'1000',
        threshold:null,minimum:'0',maximum:null,sync_completion:false,active_weekdays:[],enum_options:[]},
    }]}]
  render(<ProgressMetricFields trackers={trackers} planId="p" date="2026-09-12" value={[]} onChange={onChange} />)
  fireEvent.change(screen.getByLabelText('播放量'),{target:{value:'0'}})
  expect(onChange).toHaveBeenLastCalledWith([
    {tracker_id:'views',revision_id:'views-r',value:'0',status:'recorded',note:''},
  ])
})
```

- [x] **Step 2: 运行 RED。** `npm test -- src/components/journal/progress-metric-fields.behavior.test.tsx src/app/progress/page.behavior.test.tsx`。
- [x] **Step 3: 接现有表单。**

ProgressMetricFields props 为 Step 1 的形状，value 为 ProgressMetricInput[]。按 revisionForDate/启用/归档/plan/source 过滤，按 TrackerKind 渲染；缺席值不提交成 0，清空提交 cleared。表单完全受控，不独立保存。

进展页添加 trackers/timezone/today 状态及 GET trackers；单条编辑含 version、metrics、outcome、schedule_block_id。读取发生时间的本地表单值用 formatUtcInTimeZone(record.gmt_create,timezone)，避免浏览器时区不一致。record_id 从 searchParams 解析正整数后独立 GET，失败显示原记录已不存在；无 record_id 沿用现有列表。保持 Suspense。

```ts
const submitData:ProgressWriteInput={
  plan_id:submitPlanId,content:form.content??'',thinking:form.thinking??'',
  ...(form.custom_time?{custom_time:form.custom_time}:{}),
  ...(metricsTouched?{metrics}:{}),
  ...(form.progress_update!==undefined?{plan_progress:form.progress_update}:{}),
  ...(outcomeTouched?{outcome}:{}),
  request_id:requestId,
}
const result=await journalRequest<ProgressRecordView>('/api/progress_record',{
  method:editingId?'PUT':'POST',body:JSON.stringify(editingId
    ? {...submitData,id:editingId,expected_version:editingVersion}:submitData),
})
notifyJournalChanged({entity:'progress-record'})
```

result 保存后才清空表单；删除提交 expected_version，成功同样通知。当前窗口进展页监听 `goal-mate:data-changed` 重读列表/计划；事件监听不覆盖打开的未保存表单。跨窗口通过 focus 重读；不新增定时轮询。普通进展新建保留 legacy 计次行为；有 metrics 的新记录显示“仅记录数据 / 已完成一次”显式选择，默认仅记录数据。schedule 来源 outcome 不可改。

- [x] **Step 4: 完成真实库行为验收。** 在 Task 6 integration 文件中补全 Task 2/7 的约束和联动场景。专库准备命令单独运行：

```bash
test -n "$JOURNAL_TEST_DATABASE_URL"
DATABASE_URL="$JOURNAL_TEST_DATABASE_URL" npm run db:push
DATABASE_URL="$JOURNAL_TEST_DATABASE_URL" npm run db:integrity
JOURNAL_TEST_DATABASE_URL="$JOURNAL_TEST_DATABASE_URL" npm test -- src/lib/journal/postgres.integration.test.ts
```

预期 schema 与两套 integrity 均成功，集成测试全部 PASS、无 skip。suite beforeAll 创建专用 PrismaClient，beforeEach 的种子如下（直接 Prisma 创建避免种子依赖尚未受测的 tracker service）：

```ts
const plan=await db.plan.create({data:{name:`journal-${crypto.randomUUID()}`,is_recurring:true,
  plan_id:crypto.randomUUID(),recurrence_type:'daily',recurrence_value:'1'}})
const trackers=await Promise.all([0,1].map(index=>db.trackerDefinition.create({data:{
  name:`运动 ${index}`,kind:'boolean',position:index,enabled_from:new Date('2026-09-01T00:00:00Z'),
  revisions:{create:{effective_from:new Date('2026-09-01T00:00:00Z'),plan_id:plan.plan_id,plan_name:plan.name,
    config:{unit:'',source:'manual',daily_aggregation:'any',encoding:'fill',units_per_cell:'1',
      threshold:null,minimum:null,maximum:null,sync_completion:true,active_weekdays:[],enum_options:[]}}},
},include:{revisions:true}})))
```

每例只删除自己的测量→事件→revision→definition→progress→plan，afterAll disconnect；不能 deleteMany({}) 清空其他数据。使用 `vi.useFakeTimers({toFake:['Date']})` 和 `vi.setSystemTime(new Date('2026-09-27T04:00:00Z'))` 固定实际日期，只替换 Date，不冻结数据库驱动的计时器；结束 `vi.useRealTimers()`。PlanningPreference 时区固定 Asia/Shanghai，测试结束恢复测试库此前的 preference。真实库断言包含 manual partial unique、复合 FK 拒绝错 tracker、数值/状态 CHECK、两个列并发只一次、两个真实原进展仍两次、撤销不删共享/非拥有来源、幂等重放、版本冲突、进展改期及删除保留、计划删除留测量、失败事务回滚。最终独立运行 schema.integration.test.ts 与 postgres.integration.test.ts，均不可 skip。

- [x] **Step 5: 运行最终回归。**

```bash
npm test
npx tsc --noEmit
npm run build
```

预期原有 792 项加新增测试全部 PASS，TypeScript 无错误，Next production build 成功且列出 `/journal` 和四个 `/api/journal/*` 路由。实际数量以输出为准。不要用旧版 `next lint` 作为新必需验收；build/TypeScript 失败按 systematic-debugging 找原因，不能归为“原有问题”而跳过。

- [x] **Step 6: 浏览器验收并记录结果。** 用本地专库 `npm run dev`，访问 `/journal`；在 1024px、736px、320px 和 coarse pointer 检查九月全 30 行、列/组切换、日期固定、44px 触控区域、弹窗焦点、保存失败、0/false、跨月延续轨道。桌面和手机截图与已评审草图比对；必须在实际应用页面检验，不能只复用 HTML 草图的 QA。建 150 条来源后核对月查询/当天详情完整，进展页、今日工作台与手账来回修改同一来源并确认联动。运行后停止本任务开的服务。

- [x] **Step 7: 提交与交付。** 更新规格“实现状态”只记录实际通过的验收与限制；`git diff --check` 通过，提交应用代码与明确文档：

```bash
git add src/components/journal src/app/progress src/lib/journal/postgres.integration.test.ts
git add -f docs/superpowers/specs/2026-09-27-monthly-journal-design.md
git commit -m "feat: integrate journal metrics with progress records"
```

提供分支、验证结果和实际页面截图。用户原要求的 master 代码推送已完成；新功能在 codex/monthly-journal 分支。集成/推送按届时用户指示及 finishing-a-development-branch 流程处理，不把规划提交当成功能完成。

## 执行顺序与覆盖检查

按 Task 1→12 顺序执行。类型/持久化/事务是后续 API 和 UI 的依赖；不在模型未验证时先接真实页面写入。提交边界可以因测试最小可运行单元调整，但不能跳过版本、幂等、来源与真实数据库约束。

| 已确认需求 | 对应任务 |
| --- | --- |
| 一个月一页、实际天数、轻网格、日期轴、手机分组 | 1、10 |
| 类型/单位/格子数量/颜色/编码/分组/排序/归档 | 2、3、10、11 |
| 手动和自动来源按列设置 | 3、5、6、7、11、12 |
| 快照、数量、心情、0/false/缺失/跳过区别 | 1、3、4、10、11 |
| 来源编辑、计划计次不重复、百分比显式更新 | 5、6、7、11、12 |
| 单日/跨月事件、FocusPeriod、重叠区间、全部详情 | 5、7、10、11 |
| 历史配置版本、启用/归档、source/plan 删除保留 | 2、3、5、6、7 |
| 事务、幂等、并发冲突、失败保留、完整月查询 | 2、5、6、7、8、9、11、12 |
| 原进展兼容、共享刷新、键盘与触控 | 7、9、10、11、12 |

本计划没有引入第三方数据抓取、AI 正文解析、公式、图片导出或年度页面。实施时遇到新增产品决定，先记录对已确认行为的影响，不默默改变历史数据口径。

## 规划阶段自检记录

2026-09-27：规格覆盖表已逐项核对；12 个任务、代码围栏成对，未留下待定占位。根据实际仓库修正了不存在的 Dialog 组件引用、Plan.plan_id 必填和 recurrence_value 字符串类型。将新增模型与反向关系拼入临时 schema，`npx prisma validate` 通过；未生成新客户端、未写实际数据库。隔离工作树的原有 55 文件/792 项测试通过。以上只验证规划和代码基线，不表示新功能或真实数据库行为已实现。


## 实施验收记录

2026-09-27：Task 1–12 已实现。Task 10 的格子测试与月表测试合并到 `journal-sheet.behavior.test.tsx`；Task 10–12 的 UI、编辑器与进展页在一个提交中集成，服务修正单独提交。手动值按日期唯一；进展字段按原记录唯一使用部分索引，避免同一原来源改期时误限制独立的手动日期值。

最终验证使用独立 PostgreSQL 16 专库，不连接现有应用数据库：全量 75 文件 / 898 项通过，无跳过；TypeScript 通过；Next 生产构建通过，包含 `/journal` 和四个手账 API；`db:push` 连续两次成功，独立数据库约束/手动联动 11 项通过。原有 TodayWorkspace、FocusPeriod、进展和布局测试均在全量回归中通过。

实际 Chrome 页面验收通过 1024px、736px、320px、coarse pointer 和深色偏好：全部 30 个日期、组/列分页、44px 触控行、弹窗 Esc 与焦点恢复、0 值、手动打卡/撤销、自动格编辑保留其他字段、150 条来源完整展开、100 条列表外的单条原进展编辑、保存失败保留输入和重试、列创建/排序/归档、未来口径版本、跨月计划事件。浏览器 pageerror 为 0。实际截图保存在本任务可视化目录。

独立审查发现的问题已先复现失败，再以回归测试修复：显式仅记录数据不计完成、冲突重读合并未修改字段、文字编辑保留原发生时间、失效字段仍可清除、原计划删除后的事件编辑和历史名称、同步事件改期的口径一致性。相同口径跨版本重新投影；不同单位拒绝并回滚。

新表仍沿用项目现有 `npm run db:push` 部署方式。运行服务已停止。新功能推送到 `codex/monthly-journal`，保留隔离工作树以便继续使用。
