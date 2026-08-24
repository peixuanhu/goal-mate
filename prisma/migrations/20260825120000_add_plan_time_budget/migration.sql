BEGIN;

DO $$
DECLARE
  duplicate_plan_ids text;
  oversized_plan_ids text;
  oversized_action_ids text;
  oversized_preference_ids text;
BEGIN
  SELECT string_agg("plan_id", ', ' ORDER BY "plan_id")
  INTO duplicate_plan_ids
  FROM (
    SELECT "plan_id"
    FROM "ScheduleBlock"
    WHERE "action_id" IS NULL AND "status" = 'scheduled'
    GROUP BY "plan_id"
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_plan_ids IS NOT NULL THEN
    RAISE EXCEPTION 'plans have multiple active direct schedule blocks: %', duplicate_plan_ids;
  END IF;

  SELECT string_agg("plan_id", ', ' ORDER BY "plan_id")
  INTO oversized_plan_ids
  FROM "Plan"
  WHERE "estimated_minutes" > 2147483640;

  IF oversized_plan_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Plan.estimated_minutes exceeds maximum safe 15-minute rounding value 2147483640 for plans: %', oversized_plan_ids;
  END IF;

  SELECT string_agg("action_id", ', ' ORDER BY "action_id")
  INTO oversized_action_ids
  FROM "ActionItem"
  WHERE "estimated_minutes" > 2147483640;

  IF oversized_action_ids IS NOT NULL THEN
    RAISE EXCEPTION 'ActionItem.estimated_minutes exceeds maximum safe 15-minute rounding value 2147483640 for actions: %', oversized_action_ids;
  END IF;

  SELECT string_agg("preference_id", ', ' ORDER BY "preference_id")
  INTO oversized_preference_ids
  FROM "PlanningPreference"
  WHERE "default_block_minutes" > 2147483640;

  IF oversized_preference_ids IS NOT NULL THEN
    RAISE EXCEPTION 'PlanningPreference.default_block_minutes exceeds maximum safe 15-minute rounding value 2147483640 for preferences: %', oversized_preference_ids;
  END IF;
END
$$;

ALTER TABLE "Plan" ADD COLUMN "default_block_minutes" INTEGER;

UPDATE "Plan"
SET
  "default_block_minutes" = ((("estimated_minutes"::bigint + 14) / 15) * 15)::integer,
  "estimated_minutes" = NULL
WHERE "is_recurring" = true AND "estimated_minutes" IS NOT NULL;

UPDATE "Plan"
SET "estimated_minutes" = ((("estimated_minutes"::bigint + 14) / 15) * 15)::integer
WHERE "is_recurring" = false AND "estimated_minutes" IS NOT NULL;

UPDATE "Plan"
SET "estimated_minutes" = 60
WHERE "is_recurring" = false AND "estimated_minutes" IS NULL;

UPDATE "ActionItem"
SET "estimated_minutes" = ((("estimated_minutes"::bigint + 14) / 15) * 15)::integer
WHERE "estimated_minutes" IS NOT NULL;

UPDATE "PlanningPreference"
SET "default_block_minutes" = ((("default_block_minutes"::bigint + 14) / 15) * 15)::integer
WHERE "default_block_minutes" % 15 <> 0;

ALTER TABLE "Plan" DROP CONSTRAINT IF EXISTS "Plan_estimated_minutes_check";
ALTER TABLE "ActionItem" DROP CONSTRAINT IF EXISTS "ActionItem_estimated_minutes_check";
ALTER TABLE "PlanningPreference" DROP CONSTRAINT IF EXISTS "PlanningPreference_default_block_minutes_check";

ALTER TABLE "Plan"
ADD CONSTRAINT "Plan_estimated_minutes_check"
CHECK ("estimated_minutes" IS NULL OR ("estimated_minutes" > 0 AND "estimated_minutes" % 15 = 0));

ALTER TABLE "Plan"
ADD CONSTRAINT "Plan_default_block_minutes_check"
CHECK ("default_block_minutes" IS NULL OR ("default_block_minutes" > 0 AND "default_block_minutes" % 15 = 0));

ALTER TABLE "ActionItem"
ADD CONSTRAINT "ActionItem_estimated_minutes_check"
CHECK ("estimated_minutes" IS NULL OR ("estimated_minutes" > 0 AND "estimated_minutes" % 15 = 0));

ALTER TABLE "PlanningPreference"
ADD CONSTRAINT "PlanningPreference_default_block_minutes_check"
CHECK ("default_block_minutes" > 0 AND "default_block_minutes" % 15 = 0);

ALTER TABLE "ScheduleBlock"
ADD CONSTRAINT "ScheduleBlock_slot_alignment_check"
CHECK (
  "start_at" = date_trunc('minute', "start_at")
  AND "end_at" = date_trunc('minute', "end_at")
  AND mod(extract(epoch from ("end_at" - "start_at"))::bigint, 900) = 0
) NOT VALID;

CREATE UNIQUE INDEX "ScheduleBlock_one_scheduled_direct_per_plan_idx"
ON "ScheduleBlock"("plan_id")
WHERE "action_id" IS NULL AND "status" = 'scheduled';

COMMIT;
