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
import { feedItems } from "@/db/schema";
import { t } from "@/translation/use-translation";
import { feedPostSchema } from "@/types/feed-post";
import { platformIdSchema } from "@/types/platform-id";

const importDatabaseName = "subsocial-import.db";
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

export function importDatabase(): Promise<void> {
  return DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
  })
    .then(async (result) => {
      if (result.canceled) return;

      const importUri = `file://${defaultDatabaseDirectory}/${importDatabaseName}`;
      let imported: SQLiteDatabase | undefined;
      try {
        await FileSystem.copyAsync({
          from: result.assets[0].uri,
          to: importUri,
        });
        imported = await openDatabaseAsync(
          importDatabaseName,
          { useNewConnection: true },
          defaultDatabaseDirectory,
        );
        const source = drizzle(imported);
        const items = importedRowSchema
          .array()
          .parse(source.select().from(feedItems).all());

        // Replace data atomically, keeping the live schema and migration journal.
        db.transaction(() => {
          db.delete(feedItems).run();
          for (const item of items) db.insert(feedItems).values(item).run();
        });
      } finally {
        await imported?.closeAsync().catch(console.warn);
        await FileSystem.deleteAsync(importUri, { idempotent: true }).catch(
          console.warn,
        );
      }
    })
    .catch(() => showErrorToast(t("feedImportError")));
}
