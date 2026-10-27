import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { type FeedPost } from "@/types/feed-post";
import { type PlatformId } from "@/types/platform-id";

export const feedItems = sqliteTable("feed_items", {
  id: text().primaryKey(),
  platform: text().$type<PlatformId>().notNull(),
  sourceId: text("source_id").notNull(),
  publishedAt: integer("published_at"),
  fetchedAt: integer("fetched_at").notNull(),
  post: text("item_json", { mode: "json" }).$type<FeedPost>().notNull(),
  threadId: text("thread_id").notNull(),
});

export const connections = sqliteTable("connections", {
  platform: text().$type<PlatformId>().primaryKey(),
});
