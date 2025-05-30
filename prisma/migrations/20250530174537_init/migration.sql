-- CreateTable
CREATE TABLE "Goal" (
    "id" SERIAL NOT NULL,
    "gmt_create" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gmt_modified" TIMESTAMP(3) NOT NULL,
    "goal_id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" SERIAL NOT NULL,
    "gmt_create" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gmt_modified" TIMESTAMP(3) NOT NULL,
    "plan_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "difficulty" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanTagAssociation" (
    "id" SERIAL NOT NULL,
    "gmt_create" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gmt_modified" TIMESTAMP(3) NOT NULL,
    "plan_id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "PlanTagAssociation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressRecord" (
    "id" SERIAL NOT NULL,
    "gmt_create" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gmt_modified" TIMESTAMP(3) NOT NULL,
    "plan_id" TEXT NOT NULL,
    "content" TEXT,
    "thinking" TEXT,

    CONSTRAINT "ProgressRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" SERIAL NOT NULL,
    "gmt_create" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gmt_modified" TIMESTAMP(3) NOT NULL,
    "report_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "content" TEXT,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Goal_goal_id_key" ON "Goal"("goal_id");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_plan_id_key" ON "Plan"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "Report_report_id_key" ON "Report"("report_id");

-- AddForeignKey
ALTER TABLE "PlanTagAssociation" ADD CONSTRAINT "PlanTagAssociation_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Plan"("plan_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Plan"("plan_id") ON DELETE CASCADE ON UPDATE CASCADE;
