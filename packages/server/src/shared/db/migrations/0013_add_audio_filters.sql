ALTER TABLE `guildSettings` ADD COLUMN `karaokeEnabled` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `karaokeLevel` real NOT NULL DEFAULT 1.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `karaokeMonoLevel` real NOT NULL DEFAULT 1.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `karaokeFilterBand` real NOT NULL DEFAULT 220.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `karaokeFilterWidth` real NOT NULL DEFAULT 100.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `timescaleEnabled` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `timescaleSpeed` real NOT NULL DEFAULT 1.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `timescalePitch` real NOT NULL DEFAULT 1.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `timescaleRate` real NOT NULL DEFAULT 1.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `tremoloEnabled` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `tremoloFrequency` real NOT NULL DEFAULT 2.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `tremoloDepth` real NOT NULL DEFAULT 0.5;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `vibratoEnabled` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `vibratoFrequency` real NOT NULL DEFAULT 2.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `vibratoDepth` real NOT NULL DEFAULT 0.5;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `rotationEnabled` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `rotationHz` real NOT NULL DEFAULT 0.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `distortionEnabled` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `distortionSinOffset` real NOT NULL DEFAULT 0.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `distortionSinScale` real NOT NULL DEFAULT 1.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `distortionCosOffset` real NOT NULL DEFAULT 0.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `distortionCosScale` real NOT NULL DEFAULT 1.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `distortionTanOffset` real NOT NULL DEFAULT 0.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `distortionTanScale` real NOT NULL DEFAULT 1.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `distortionOffset` real NOT NULL DEFAULT 0.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `distortionScale` real NOT NULL DEFAULT 1.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `channelMixEnabled` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `channelMixLeftToLeft` real NOT NULL DEFAULT 1.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `channelMixLeftToRight` real NOT NULL DEFAULT 0.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `channelMixRightToLeft` real NOT NULL DEFAULT 0.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `channelMixRightToRight` real NOT NULL DEFAULT 1.0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `lowPassEnabled` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `guildSettings` ADD COLUMN `lowPassSmoothing` real NOT NULL DEFAULT 20.0;
