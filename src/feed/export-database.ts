import * as Sharing from "expo-sharing";
import {
  backupDatabaseAsync,
  defaultDatabaseDirectory,
  deleteDatabaseAsync,
  openDatabaseSync,
} from "expo-sqlite";

import { database } from "@/feed/database";

const exportDatabaseName = "subsocial-export.db";

export async function exportDatabase(): Promise<void> {
  try {
    await deleteDatabaseAsync(exportDatabaseName, defaultDatabaseDirectory);
  } catch {
    // The temporary export does not exist before the first export.
  }

  const exported = openDatabaseSync(
    exportDatabaseName,
    { useNewConnection: true },
    defaultDatabaseDirectory,
  );

  try {
    await backupDatabaseAsync({
      sourceDatabase: database,
      destDatabase: exported,
    });
    await Sharing.shareAsync(
      `file://${defaultDatabaseDirectory}/${exportDatabaseName}`,
      { dialogTitle: "Export subsocial database" },
    );
  } finally {
    exported.closeSync();
  }
}
