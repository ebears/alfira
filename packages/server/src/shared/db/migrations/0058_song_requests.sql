--> statement-breakpoint
ALTER TABLE "guildSettings" RENAME COLUMN "notificationChannelId" TO "afkNotificationChannelId";
--> statement-breakpoint
ALTER TABLE "guildSettings" ADD COLUMN "requestNotificationChannelId" text;
--> statement-breakpoint
ALTER TABLE "guildSettings" ADD COLUMN "notifyOnApproved" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "guildSettings" ADD COLUMN "notifyOnDenied" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE "SongRequest" (
  "id" text PRIMARY KEY NOT NULL,
  "sourceUrl" text NOT NULL,
  "sourceId" text NOT NULL,
  "title" text NOT NULL,
  "duration" integer NOT NULL,
  "thumbnailUrl" text NOT NULL,
  "artist" text,
  "artworkUrl" text,
  "sourceName" text,
  "requestedBy" text NOT NULL,
  "notifyDm" integer NOT NULL DEFAULT 0,
  "type" text NOT NULL DEFAULT 'track',
  "playlistData" text,
  "status" text NOT NULL DEFAULT 'pending',
  "reviewedBy" text,
  "createdAt" integer NOT NULL,
  "closedAt" integer
);
--> statement-breakpoint
UPDATE "rolePermission" SET "action" = 'requests.autoapprove' WHERE "action" = 'songs.add';
