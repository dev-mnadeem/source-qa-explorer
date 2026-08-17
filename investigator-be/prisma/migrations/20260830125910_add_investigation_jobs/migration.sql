-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "investigation_jobs" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "events" JSONB NOT NULL DEFAULT '[]',
    "result_message_id" UUID,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investigation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "investigation_jobs_status_created_at_idx" ON "investigation_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "investigation_jobs_session_id_idx" ON "investigation_jobs"("session_id");

-- AddForeignKey
ALTER TABLE "investigation_jobs" ADD CONSTRAINT "investigation_jobs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
