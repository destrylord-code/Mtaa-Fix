-- Fix Escalation.status column type
-- The Prisma schema defines status as EscalationStatus enum but the
-- database column was created as text with a text default. PostgreSQL cannot
-- cast the existing default automatically, so drop it before the conversion
-- and restore the enum default afterwards. Existing rows are preserved.
ALTER TABLE "escalations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "escalations" ALTER COLUMN "status" TYPE "EscalationStatus" USING "status"::"EscalationStatus";
ALTER TABLE "escalations" ALTER COLUMN "status" SET DEFAULT 'OPEN';
