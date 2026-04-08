-- Persist estimated basket total at save time (shown in saved list UIs)
ALTER TABLE "SmartList" ADD COLUMN IF NOT EXISTS "estimatedTotalSnapshot" DOUBLE PRECISION;
