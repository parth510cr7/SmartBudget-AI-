-- BasketTermPreference: user learning when picking a suggestion for a broad typed term
CREATE TABLE IF NOT EXISTS "BasketTermPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termKey" TEXT NOT NULL,
    "pickedLabel" TEXT NOT NULL,
    "pickCount" INTEGER NOT NULL DEFAULT 1,
    "lastPickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BasketTermPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BasketTermPreference_userId_termKey_pickedLabel_key" ON "BasketTermPreference"("userId", "termKey", "pickedLabel");

CREATE INDEX IF NOT EXISTS "BasketTermPreference_userId_termKey_idx" ON "BasketTermPreference"("userId", "termKey");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BasketTermPreference_userId_fkey'
  ) THEN
    ALTER TABLE "BasketTermPreference" ADD CONSTRAINT "BasketTermPreference_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
