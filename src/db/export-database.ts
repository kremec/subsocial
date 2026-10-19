import * as Sharing from "expo-sharing";
import {
  backupDatabaseAsync,
  defaultDatabaseDirectory,
  deleteDatabaseAsync,
  openDatabaseSync,
} from "expo-sqlite";

import { database } from "@/db/client";

const exportDatabaseName = "subsocial-export.db";

export async function exportDatabase(): Promise<void> {
  // The temporary export does not exist before the first export.
  await deleteDatabaseAsync(exportDatabaseName, defaultDatabaseDirectory).catch(
    () => undefined,
  );
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
