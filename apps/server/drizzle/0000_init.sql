CREATE TABLE `activity_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`sender` text NOT NULL,
	`action` text NOT NULL,
	`why` text NOT NULL,
	`decided_by` text NOT NULL,
	`confidence` integer,
	`kind` text NOT NULL,
	`message_ids` text,
	`restored` integer DEFAULT false NOT NULL,
	`dry_run` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `activity_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `activity_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`id` integer PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sender` text NOT NULL,
	`initials` text NOT NULL,
	`address` text NOT NULL,
	`volume` text NOT NULL,
	`action` text NOT NULL,
	`delete_count` text,
	`confidence` integer NOT NULL,
	`reason` text NOT NULL,
	`has_detail` integer DEFAULT false NOT NULL,
	`payload` text NOT NULL,
	`decision` text,
	`decided_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sender_feedback` (
	`address` text PRIMARY KEY NOT NULL,
	`verdict` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`rules` text NOT NULL,
	`last_run_at` text,
	`last_run_stats` text
);
