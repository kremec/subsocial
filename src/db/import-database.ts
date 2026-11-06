import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  defaultDatabaseDirectory,
  deleteDatabaseAsync,
  openDatabaseSync,
} from "expo-sqlite";

import { z } from "zod";

import { db } from "@/db/client";
import { connections, feedItems } from "@/db/schema";
import { t } from "@/translation/use-translation";
import { feedPostSchema } from "@/types/feed-post";
import { platformIdSchema } from "@/types/platform-id";

const importDatabaseName = "subsocial-import.db";
const importedRowSchema = z.object({
  id: z.string().min(1),
  platform: platformIdSchema,
  source_id: z.string().min(1),
  published_at: z.number().positive().nullable(),
  fetched_at: z.number().nonnegative(),
  item_json: z.string(),
  thread_id: z.string().min(1),
});

export async function importDatabase(): Promise<boolean> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
  });
  if (result.canceled) return false;

  // The temporary import does not exist before the first import.
  await deleteDatabaseAsync(importDatabaseName, defaultDatabaseDirectory).catch(
    () => undefined,
  );

  await FileSystem.copyAsync({
    from: result.assets[0].uri,
    to: `file://${defaultDatabaseDirectory}/${importDatabaseName}`,
  });
  const imported = openDatabaseSync(
    importDatabaseName,
    { useNewConnection: true },
    defaultDatabaseDirectory,
  );

  try {
    // Validate the backup before replacing the live database.
    if (
      !imported.getFirstSync(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'feed_items'",
      )
    )
      throw new Error(t("invalidDatabase"));
    const items = z
      .array(importedRowSchema)
      .parse(
        imported.getAllSync(
          "SELECT id, platform, source_id, published_at, fetched_at, item_json, thread_id FROM feed_items",
        ),
      )
      .map((row) => {
        if (
          row.id !== `${row.platform}:${row.source_id}` ||
          !row.thread_id.startsWith(`${row.platform}:`)
        )
          throw new Error(t("invalidImportedPostIdentity"));
        return {
          id: row.id,
          platform: row.platform,
          sourceId: row.source_id,
          publishedAt: row.published_at,
          fetchedAt: row.fetched_at,
          post: feedPostSchema.parse(JSON.parse(row.item_json)),
          threadId: row.thread_id,
        };
      });
    const accounts = z
      .array(z.object({ platform: platformIdSchema }))
      .parse(imported.getAllSync("SELECT platform FROM connections"));
    db.transaction(() => {
      db.delete(feedItems).run();
      db.delete(connections).run();
      for (const item of items) db.insert(feedItems).values(item).run();
      for (const account of accounts)
        db.insert(connections).values(account).run();
    });
    return true;
  } finally {
    imported.closeSync();
    await deleteDatabaseAsync(
      importDatabaseName,
      defaultDatabaseDirectory,
    ).catch(() => undefined);
  }
}
