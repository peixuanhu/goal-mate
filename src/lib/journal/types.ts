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
  cells:Record<string,Record<string,JournalCell>>; events:JournalEventView[]
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
export type TrackerMutation = TrackerUpdateInput
  | ({action:'reorder'} & TrackerOrderInput)
  | ({action:'archive'} & TrackerArchiveInput)
export type JournalEventInput={
  title:string;start_date:string;end_date:string;note:string;status:'planned'|'progress'|'completed'
  plan_id:string|null;goal_id:string|null;sync_completion:boolean;request_id:string
}
export type JournalEventUpdateInput=JournalEventInput & {event_id:string;expected_version:number}
export type JournalErrorCode = 'VALIDATION'|'NOT_FOUND'|'STALE_VERSION'|'SOURCE_CHANGED'
export class JournalError extends Error {
  constructor(public code:JournalErrorCode, message:string) { super(message) }
}
