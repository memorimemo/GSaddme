-- AlterEnum: Add FAILED to OutboxStatus
ALTER TYPE "OutboxStatus" ADD VALUE 'FAILED';

-- AlterTable: Add idempotencyKey to jobs
ALTER TABLE "jobs" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex: Unique constraint on (clientAppId, idempotencyKey)
CREATE UNIQUE INDEX "jobs_clientAppId_idempotencyKey_key" ON "jobs"("clientAppId", "idempotencyKey");
