CREATE UNIQUE INDEX IF NOT EXISTS "TrackerMeasurement_manual_cell_idx"
ON "TrackerMeasurement" ("tracker_id", "local_date") WHERE "origin" = 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS "TrackerMeasurement_progress_field_idx"
ON "TrackerMeasurement" ("tracker_id", "progress_record_id") WHERE "origin" = 'progress_field';

DO $$ BEGIN
  ALTER TABLE "TrackerMeasurement" ADD CONSTRAINT "TrackerMeasurement_value_check"
  CHECK (
    ("status" IN ('skipped','cleared') AND num_nonnulls("boolean_value","numeric_value","enum_value")=0)
    OR ("status"='recorded' AND num_nonnulls("boolean_value","numeric_value","enum_value")=1)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
