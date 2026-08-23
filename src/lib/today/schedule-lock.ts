import type { Prisma } from "@prisma/client"

export const SCHEDULE_DATE_LOCK_NAMESPACE = 48_241

export async function lockScheduleLocalDates(
  db: Prisma.TransactionClient,
  dates: readonly string[],
): Promise<void> {
  const sortedDates = [...new Set(dates)].sort()
  for (const date of sortedDates) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(${SCHEDULE_DATE_LOCK_NAMESPACE}::int, hashtext(${date})::int)`
  }
}
