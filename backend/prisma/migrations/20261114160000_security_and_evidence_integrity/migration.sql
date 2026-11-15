-- Preserve report/inspection data while adding private upload ownership.
ALTER TABLE "field_inspections" ADD COLUMN "mediaUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "work_updates" ADD COLUMN "mediaUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "citizen_verifications" ADD COLUMN "citizenId" TEXT;
ALTER TABLE "citizen_verifications" ADD CONSTRAINT "citizen_verifications_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_attachments" ALTER COLUMN "reportId" DROP NOT NULL;
ALTER TABLE "report_attachments" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "report_attachments" DROP CONSTRAINT IF EXISTS "report_attachments_reportId_fkey";
ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "report_attachments_url_key" ON "report_attachments"("url");
CREATE INDEX "report_attachments_ownerId_idx" ON "report_attachments"("ownerId");

-- Link previously stored local evidence to its existing report. No files or
-- report rows are deleted. Unlinked legacy files remain administrator-only.
INSERT INTO "report_attachments" ("id", "reportId", "url", "createdAt")
SELECT gen_random_uuid()::text, r.id, u.url, NOW()
FROM "reports" r CROSS JOIN LATERAL unnest(r."mediaUrls" || r."resolutionMediaUrls") AS u(url)
WHERE u.url ~ '^/uploads/report-[A-Za-z0-9.-]+$'
ON CONFLICT ("url") DO NOTHING;

-- Refresh secrets are now looked up by SHA-256, not stored as bearer plaintext.
UPDATE "refresh_tokens" SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex') WHERE length("token") <> 64;
UPDATE "verification_tokens" SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex') WHERE length("token") <> 64;
UPDATE "password_reset_tokens" SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex') WHERE length("token") <> 64;
-- Short-lived plaintext OTP/reset codes cannot be migrated to keyed hashes.
-- Invalidate them; users can request a new code. Account/report data is untouched.
DELETE FROM "verification_tokens";
DELETE FROM "password_reset_tokens";

ALTER TABLE "escalations" ADD COLUMN "previousStatus" "ReportStatus";

CREATE UNIQUE INDEX "escalations_one_open_per_report" ON "escalations"("reportId") WHERE "status" = 'OPEN';
