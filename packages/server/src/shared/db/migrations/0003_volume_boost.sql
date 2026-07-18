-- Add new volumeBoost column
ALTER TABLE "Song" ADD COLUMN "volumeBoost" integer;

-- Drop old volumeOffset column (data discarded per design decision)
ALTER TABLE "Song" DROP COLUMN "volumeOffset";
