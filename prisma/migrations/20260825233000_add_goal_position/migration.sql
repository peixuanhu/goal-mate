BEGIN;

ALTER TABLE "Goal" ADD COLUMN "position" INTEGER;

WITH ranked_goals AS (
  SELECT
    "goal_id",
    ROW_NUMBER() OVER (
      ORDER BY "gmt_create" DESC, "goal_id" ASC
    ) - 1 AS normalized_position
  FROM "Goal"
)
UPDATE "Goal" AS goal
SET "position" = ranked_goals.normalized_position
FROM ranked_goals
WHERE goal."goal_id" = ranked_goals."goal_id";

CREATE INDEX "Goal_position_idx" ON "Goal"("position");

COMMIT;
