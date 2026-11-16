import * as Sharing from "expo-sharing";
import {
  backupDatabaseAsync,
  defaultDatabaseDirectory,
  openDatabaseAsync,
} from "expo-sqlite";

import { showErrorToast } from "@/components/ui/toast";
import { expoDb } from "@/db/client";
import { logError, logInfo } from "@/logging/logger";
import { t } from "@/translation/use-translation";

const EXPORT_DB_NAME = "subsocial-export.db";

export function exportDatabase(): Promise<void> {
  logInfo("db.export", "start");

  return openDatabaseAsync(
    EXPORT_DB_NAME,
    { useNewConnection: true },
    defaultDatabaseDirectory,
  )
    .then((exportDb) =>
      backupDatabaseAsync({
        sourceDatabase: expoDb,
        destDatabase: exportDb,
      })
        // Close before sharing so the exported file is self-contained.
        .finally(() => exportDb.closeAsync())
        .then(async () => {
          const exportPath = `file://${defaultDatabaseDirectory}/${EXPORT_DB_NAME}`;
          await Sharing.shareAsync(exportPath, {
            dialogTitle: t("exportDatabaseTitle"),
          });
          logInfo("db.export", "share-opened");
        }),
    )
    .catch((error) => {
      logError("db.export", "failed", error);
      showErrorToast(t("feedExportError"));
    });
}
