ALTER TABLE "guildSettings" ADD COLUMN "guildId" text;
--> statement-breakpoint
ALTER TABLE "guildSettings" ADD COLUMN "setupCompleted" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "guildSettings" ADD COLUMN "adminRoleIds" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "guildSettings" ADD COLUMN "voiceIdleTimeoutMinutes" integer NOT NULL DEFAULT 5;
--> statement-breakpoint
ALTER TABLE "guildSettings" ADD COLUMN "notificationChannelId" text;
--> statement-breakpoint
ALTER TABLE "guildSettings" ADD COLUMN "publicUrl" text;
