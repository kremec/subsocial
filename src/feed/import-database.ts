import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  backupDatabaseAsync,
  defaultDatabaseDirectory,
  deleteDatabaseAsync,
  openDatabaseSync,
} from "expo-sqlite";

import { z } from "zod";

import { database, migrateDatabase } from "@/feed/database";
import { feedPostSchema, platformIdSchema } from "@/feed/schemas";

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
  if (result.canceled || result.assets.length === 0) return false;

  try {
    await deleteDatabaseAsync(importDatabaseName, defaultDatabaseDirectory);
  } catch {
    // The temporary import does not exist before the first import.
  }

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
    // Reject unrelated or incompatible databases before replacing local data.
    const rows = z
      .array(importedRowSchema)
      .parse(
        imported.getAllSync(
          "SELECT id, platform, source_id, published_at, fetched_at, item_json, thread_id FROM feed_items",
        ),
      );
    z.array(z.object({ platform: platformIdSchema })).parse(
      imported.getAllSync("SELECT platform FROM connections"),
    );
    imported.withTransactionSync(() => {
      for (const row of rows) {
        if (
          row.id !== `${row.platform}:${row.source_id}` ||
          !row.thread_id.startsWith(`${row.platform}:`)
        )
          throw new Error("Invalid imported post identity");
        const post = feedPostSchema.parse(JSON.parse(row.item_json));
        imported.runSync(
          "UPDATE feed_items SET item_json = ? WHERE id = ?",
          JSON.stringify(post),
          row.id,
        );
      }
    });
    migrateDatabase(imported);
    await backupDatabaseAsync({
      sourceDatabase: imported,
      destDatabase: database,
    });
    return true;
  } finally {
    imported.closeSync();
    try {
      await deleteDatabaseAsync(importDatabaseName, defaultDatabaseDirectory);
    } catch {
      // Ignore cleanup failures for temporary imports.
    }
  }
}
