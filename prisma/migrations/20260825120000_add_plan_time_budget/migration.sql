ALTER TABLE "Plan" ADD COLUMN "default_block_minutes" INTEGER;

UPDATE "Plan"
SET
  "default_block_minutes" = (("estimated_minutes" + 14) / 15) * 15,
  "estimated_minutes" = NULL
WHERE "is_recurring" = true AND "estimated_minutes" IS NOT NULL;

UPDATE "Plan"
SET "estimated_minutes" = (("estimated_minutes" + 14) / 15) * 15
WHERE "is_recurring" = false AND "estimated_minutes" IS NOT NULL;

UPDATE "Plan"
SET "estimated_minutes" = 60
WHERE "is_recurring" = false AND "estimated_minutes" IS NULL;

UPDATE "ActionItem"
SET "estimated_minutes" = (("estimated_minutes" + 14) / 15) * 15
WHERE "estimated_minutes" IS NOT NULL;

DO $$
DECLARE duplicate_plan_ids text;
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
END
$$;

ALTER TABLE "Plan" DROP CONSTRAINT IF EXISTS "Plan_estimated_minutes_check";
ALTER TABLE "ActionItem" DROP CONSTRAINT IF EXISTS "ActionItem_estimated_minutes_check";

ALTER TABLE "Plan"
ADD CONSTRAINT "Plan_estimated_minutes_check"
CHECK ("estimated_minutes" IS NULL OR ("estimated_minutes" > 0 AND "estimated_minutes" % 15 = 0));

ALTER TABLE "Plan"
ADD CONSTRAINT "Plan_default_block_minutes_check"
CHECK ("default_block_minutes" IS NULL OR ("default_block_minutes" > 0 AND "default_block_minutes" % 15 = 0));

ALTER TABLE "ActionItem"
ADD CONSTRAINT "ActionItem_estimated_minutes_check"
CHECK ("estimated_minutes" IS NULL OR ("estimated_minutes" > 0 AND "estimated_minutes" % 15 = 0));

CREATE UNIQUE INDEX "ScheduleBlock_one_scheduled_direct_per_plan_idx"
ON "ScheduleBlock"("plan_id")
WHERE "action_id" IS NULL AND "status" = 'scheduled';
