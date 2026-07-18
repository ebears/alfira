-- Rename youtubeUrl / youtubeId columns to sourceUrl / sourceId
-- SQLite doesn't support ALTER TABLE RENAME COLUMN, so we recreate.

CREATE TABLE "Song_new" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "sourceUrl" text NOT NULL,
  "sourceId" text NOT NULL,
  "duration" integer NOT NULL,
  "thumbnailUrl" text NOT NULL,
  "addedBy" text NOT NULL,
  "nickname" text,
  "artist" text,
  "album" text,
  "artwork" text,
  "tags" text NOT NULL DEFAULT '[]',
  "volumeBoost" integer,
  "createdAt" integer NOT NULL
);
--> statement-breakpoint

INSERT INTO "Song_new" SELECT
  "id",
  "title",
  "youtubeUrl" AS "sourceUrl",
  "youtubeId" AS "sourceId",
  "duration",
  "thumbnailUrl",
  "addedBy",
  "nickname",
  "artist",
  "album",
  "artwork",
  "tags",
  "volumeBoost",
  "createdAt"
FROM "Song";
--> statement-breakpoint

DROP TABLE "Song";
--> statement-breakpoint

ALTER TABLE "Song_new" RENAME TO "Song";
--> statement-breakpoint

CREATE UNIQUE INDEX "Song_sourceUrl_unique" ON "Song" ("sourceUrl");
--> statement-breakpoint

CREATE UNIQUE INDEX "Song_sourceId_unique" ON "Song" ("sourceId");
