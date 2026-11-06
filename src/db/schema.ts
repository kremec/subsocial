import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { type FeedPost } from "@/types/feed-post";
import { type PlatformId } from "@/types/platform-id";

export const feedItems = sqliteTable(
  "feed_items",
  {
    id: text().primaryKey().notNull(),
    platform: text().$type<PlatformId>().notNull(),
    sourceId: text("source_id").notNull(),
    publishedAt: integer("published_at"),
    fetchedAt: integer("fetched_at").notNull(),
    post: text("item_json", { mode: "json" }).$type<FeedPost>().notNull(),
    threadId: text("thread_id").notNull(),
  },
  (table) => [
    index("feed_items_publication_order").on(
      sql`${table.publishedAt} DESC`,
      sql`${table.id} DESC`,
    ),
    index("feed_items_thread").on(table.threadId),
    index("feed_items_reply").on(
      table.platform,
      sql`json_extract(${table.post}, '$.replyToSourceId')`,
    ),
    index("feed_items_thread_context").on(
      table.platform,
      sql`json_extract(${table.post}, '$.threadContextSourceId')`,
    ),
  ],
);

export const connections = sqliteTable("connections", {
  platform: text().$type<PlatformId>().primaryKey().notNull(),
});
