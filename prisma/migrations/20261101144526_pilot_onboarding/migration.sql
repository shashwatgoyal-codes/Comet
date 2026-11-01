-- CreateEnum
CREATE TYPE "pilot_document_kind" AS ENUM ('driving_licence', 'rc', 'vehicle_photo', 'background_check');

-- CreateEnum
CREATE TYPE "pilot_document_status" AS ENUM ('in_review', 'verified', 'rejected');

-- AlterTable
ALTER TABLE "pilot_profiles" ADD COLUMN     "payout_upi_id" VARCHAR(80),
ADD COLUMN     "profile_completed_at" TIMESTAMPTZ,
ADD COLUMN     "rejection_reason" VARCHAR(300),
ADD COLUMN     "submitted_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "pilot_documents" (
    "id" UUID NOT NULL,
    "pilot_id" UUID NOT NULL,
    "kind" "pilot_document_kind" NOT NULL,
    "status" "pilot_document_status" NOT NULL DEFAULT 'in_review',
    "reference_last4" VARCHAR(4),
    "expires_on" DATE,
    "storage_path" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pilot_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_audit_log" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" UUID,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pilot_documents_pilot_kind_key" ON "pilot_documents"("pilot_id", "kind");

-- CreateIndex
CREATE INDEX "ops_audit_log_created_idx" ON "ops_audit_log"("created_at" DESC);

-- CreateIndex
CREATE INDEX "pilot_profiles_review_queue_idx" ON "pilot_profiles"("status", "submitted_at");

-- AddForeignKey
ALTER TABLE "pilot_documents" ADD CONSTRAINT "pilot_documents_pilot_id_fkey" FOREIGN KEY ("pilot_id") REFERENCES "pilot_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------------
-- Hand-written below: what Prisma can't express. (docs/DATABASE.md §5)
-- ------------------------------------------------------------------

-- Ops actions are never edited or deleted.
CREATE TRIGGER "ops_audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "ops_audit_log"
  FOR EACH ROW EXECUTE FUNCTION "reject_change"();

-- Only a complete application can be waiting for review.
ALTER TABLE "pilot_profiles" ADD CONSTRAINT "pilot_profiles_submitted_needs_onboarding"
  CHECK (
    "submitted_at" IS NULL
    OR ("profile_completed_at" IS NOT NULL AND "payout_upi_id" IS NOT NULL
        AND "vehicle_type" IS NOT NULL AND "plate" IS NOT NULL)
  );

ALTER TABLE "pilot_documents" ADD CONSTRAINT "pilot_documents_last4_shape"
  CHECK ("reference_last4" IS NULL OR "reference_last4" ~ '^[A-Z0-9]{4}$');

ALTER TABLE "pilot_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ops_audit_log" ENABLE ROW LEVEL SECURITY;
