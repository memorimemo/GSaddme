-- AlterTable: Add promptHint to templates
-- Stores structured JSON scene data (loaded from per-template .json sidecar files during sync)
ALTER TABLE "templates" ADD COLUMN "promptHint" TEXT;
