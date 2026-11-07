import * as Sharing from "expo-sharing";
import {
  backupDatabaseAsync,
  defaultDatabaseDirectory,
  openDatabaseAsync,
} from "expo-sqlite";

import { showErrorToast } from "@/components/ui/toast";
import { database } from "@/db/client";
import { t } from "@/translation/use-translation";

const exportDatabaseName = "subsocial-export.db";

export function exportDatabase(): Promise<void> {
  return openDatabaseAsync(
    exportDatabaseName,
    { useNewConnection: true },
    defaultDatabaseDirectory,
  )
    .then((exported) =>
      backupDatabaseAsync({
        sourceDatabase: database,
        destDatabase: exported,
      }).finally(() => exported.closeAsync()),
    )
    .then(() =>
      Sharing.shareAsync(
        `file://${defaultDatabaseDirectory}/${exportDatabaseName}`,
        { dialogTitle: t("exportDatabaseTitle") },
      ),
    )
    .catch(() => showErrorToast(t("feedExportError")));
}
