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

const exportDatabaseName = "subsocial-export.db";

export function exportDatabase(): Promise<void> {
  logInfo("db.export", "start");

  return openDatabaseAsync(
    exportDatabaseName,
    { useNewConnection: true },
    defaultDatabaseDirectory,
  )
    .then((exported) =>
      backupDatabaseAsync({
        sourceDatabase: expoDb,
        destDatabase: exported,
      }).finally(() => exported.closeAsync()),
    )
    .then(async () => {
      await Sharing.shareAsync(
        `file://${defaultDatabaseDirectory}/${exportDatabaseName}`,
        { dialogTitle: t("exportDatabaseTitle") },
      );
      logInfo("db.export", "share-opened");
    })
    .catch((error) => {
      logError("db.export", "failed", error);
      showErrorToast(t("feedExportError"));
    });
}
