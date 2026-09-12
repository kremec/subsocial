import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  backupDatabaseAsync,
  defaultDatabaseDirectory,
  deleteDatabaseAsync,
  openDatabaseSync,
} from "expo-sqlite";

import { database } from "@/feed/database";

const importDatabaseName = "subsocial-import.db";

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
    imported.getAllSync(
      "SELECT id, platform, source_id, published_at, fetched_at, item_json, thread_id FROM feed_items LIMIT 0",
    );
    imported.getAllSync("SELECT platform FROM connections LIMIT 0");
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
