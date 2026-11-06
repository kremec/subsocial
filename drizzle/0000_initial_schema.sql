CREATE TABLE `connections` (
	`platform` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feed_items` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`source_id` text NOT NULL,
	`published_at` integer,
	`fetched_at` integer NOT NULL,
	`item_json` text NOT NULL,
	`thread_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feed_items_publication_order` ON `feed_items` ("published_at" DESC,"id" DESC);
--> statement-breakpoint
CREATE INDEX `feed_items_thread` ON `feed_items` (`thread_id`);
--> statement-breakpoint
-- Keep these expressions intact: drizzle-kit 0.31 splits them at the comma (#6062).
CREATE INDEX `feed_items_reply` ON `feed_items` (`platform`,json_extract("item_json", '$.replyToSourceId'));
--> statement-breakpoint
CREATE INDEX `feed_items_thread_context` ON `feed_items` (`platform`,json_extract("item_json", '$.threadContextSourceId'));
