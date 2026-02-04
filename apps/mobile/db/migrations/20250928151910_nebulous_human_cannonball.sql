CREATE TABLE `resource_content` (
	`key` text PRIMARY KEY NOT NULL,
	`resource_key` text NOT NULL,
	`resource_id` text NOT NULL,
	`server` text NOT NULL,
	`owner` text NOT NULL,
	`language` text NOT NULL,
	`type` text NOT NULL,
	`book_code` text,
	`article_id` text,
	`content` text NOT NULL,
	`last_fetched` integer NOT NULL,
	`cached_until` integer,
	`checksum` text,
	`size` integer NOT NULL,
	`source_sha` text,
	`source_commit` text,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `idx_resource_content_resource_key` ON `resource_content` (`resource_key`);--> statement-breakpoint
CREATE INDEX `idx_resource_content_resource_id_type` ON `resource_content` (`resource_id`,`type`);--> statement-breakpoint
CREATE INDEX `idx_resource_content_book_code` ON `resource_content` (`book_code`);--> statement-breakpoint
CREATE INDEX `idx_resource_content_cached_until` ON `resource_content` (`cached_until`);--> statement-breakpoint
CREATE INDEX `idx_resource_content_server_owner_language` ON `resource_content` (`server`,`owner`,`language`);--> statement-breakpoint
CREATE INDEX `idx_resource_content_source_sha` ON `resource_content` (`source_sha`);--> statement-breakpoint
CREATE TABLE `resource_metadata` (
	`resource_key` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`server` text NOT NULL,
	`owner` text NOT NULL,
	`language` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`last_updated` integer NOT NULL,
	`available` integer DEFAULT true NOT NULL,
	`is_anchor` integer DEFAULT false NOT NULL,
	`toc` text,
	`language_direction` text,
	`language_title` text,
	`language_is_gl` integer,
	`commit_sha` text,
	`file_hashes` text,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `idx_resource_metadata_server_owner_language` ON `resource_metadata` (`server`,`owner`,`language`);--> statement-breakpoint
CREATE INDEX `idx_resource_metadata_type` ON `resource_metadata` (`type`);--> statement-breakpoint
CREATE INDEX `idx_resource_metadata_name` ON `resource_metadata` (`name`);--> statement-breakpoint
CREATE INDEX `idx_resource_metadata_anchor` ON `resource_metadata` (`is_anchor`);--> statement-breakpoint
CREATE TABLE `storage_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`total_size` integer DEFAULT 0 NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`last_cleanup` integer DEFAULT (unixepoch()),
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storage_stats_key_unique` ON `storage_stats` (`key`);