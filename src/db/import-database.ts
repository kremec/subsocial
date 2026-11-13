import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  defaultDatabaseDirectory,
  openDatabaseAsync,
  type SQLiteDatabase,
} from "expo-sqlite";

import { drizzle } from "drizzle-orm/expo-sqlite";
import { z } from "zod";

import { showErrorToast } from "@/components/ui/toast";
import { db } from "@/db/client";
import { feedItemsTable } from "@/db/schema";
import { logError, logInfo } from "@/logging/logger";
import { t } from "@/translation/use-translation";
import { feedPostSchema } from "@/types/feed-post";
import { platformIdSchema } from "@/types/platform-id";

const IMPORT_DB_NAME = "subsocial-import.db";
const importedRowSchema = z
  .object({
    id: z.string().min(1),
    platform: platformIdSchema,
    sourceId: z.string().min(1),
    publishedAt: z.number().positive().nullable(),
    fetchedAt: z.number().nonnegative(),
    post: feedPostSchema,
    threadId: z.string().min(1),
  })
  .refine(
    (row) =>
      row.id === `${row.platform}:${row.sourceId}` &&
      row.threadId.startsWith(`${row.platform}:`),
  );

async function pickDatabaseFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
  });
  return result.canceled ? null : result.assets[0].uri;
}

export function importDatabase(): Promise<void> {
  return pickDatabaseFile()
    .then(async (pickedUri) => {
      if (!pickedUri) return;

      logInfo("db.import", "start");

      const importUri = `file://${defaultDatabaseDirectory}/${IMPORT_DB_NAME}`;
      let imported: SQLiteDatabase | undefined;
      try {
        await FileSystem.copyAsync({
          from: pickedUri,
          to: importUri,
        });
        imported = await openDatabaseAsync(
          IMPORT_DB_NAME,
          { useNewConnection: true },
          defaultDatabaseDirectory,
        );
        const source = drizzle(imported);
        const items = importedRowSchema
          .array()
          .parse(source.select().from(feedItemsTable).all());

        // Replace data atomically, keeping the live schema and migration journal.
        db.transaction(() => {
          db.delete(feedItemsTable).run();
          for (const item of items)
            db.insert(feedItemsTable).values(item).run();
        });
        logInfo("db.import", "complete");
      } finally {
        await imported?.closeAsync().catch((error) => {
          logError("db.import", "close-failed", error);
        });
        await FileSystem.deleteAsync(importUri, { idempotent: true }).catch(
          (error) => {
            logError("db.import", "cleanup-failed", error);
          },
        );
      }
    })
    .catch((error) => {
      logError("db.import", "failed", error);
      showErrorToast(t("feedImportError"));
    });
}
