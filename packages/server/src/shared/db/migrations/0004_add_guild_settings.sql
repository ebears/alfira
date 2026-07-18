CREATE TABLE IF NOT EXISTS "guildSettings" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "compressorEnabled" integer NOT NULL DEFAULT 0,
  "compressorThreshold" integer NOT NULL DEFAULT -6,
  "compressorRatio" real NOT NULL DEFAULT 4.0,
  "compressorAttack" integer NOT NULL DEFAULT 5,
  "compressorRelease" integer NOT NULL DEFAULT 50,
  "compressorGain" integer NOT NULL DEFAULT 3
);

INSERT INTO "guildSettings" ("id", "compressorEnabled", "compressorThreshold", "compressorRatio", "compressorAttack", "compressorRelease", "compressorGain")
VALUES (1, 0, -6, 4.0, 5, 50, 3)
ON CONFLICT("id") DO NOTHING;