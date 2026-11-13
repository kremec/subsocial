DROP INDEX `feed_items_publication_order`;--> statement-breakpoint
DROP INDEX `feed_items_reply`;--> statement-breakpoint
DROP INDEX `feed_items_thread_context`;--> statement-breakpoint
CREATE INDEX `feed_items_platform` ON `feed_items` (`platform`);