import { migrate } from "drizzle-orm/expo-sqlite/migrator";

import { db, expoDb } from "@/db/client";
import { useSettingsStore } from "@/stores/settings-store";
import { t } from "@/translation/use-translation";
import { type PlatformId } from "@/types/platform-id";
import migrations from "@drizzle/migrations";

export async function migrateDatabase(): Promise<void> {
  // Persist current configured accounts before their table is removed.
  if (
    expoDb.getFirstSync(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'connections'",
    )
  ) {
    if (!useSettingsStore.persist.hasHydrated()) {
      throw new Error(t("settingsLoadFailed"));
    }

    const previous = expoDb.getAllSync<{ platform: PlatformId }>(
      "SELECT platform FROM connections",
    );
    const { settings, updateSettings } = useSettingsStore.getState();
    updateSettings({
      connectedPlatforms: [
        ...new Set([
          ...settings.connectedPlatforms,
          ...previous.map((row) => row.platform),
        ]),
      ].sort(),
    });
  }

  await migrate(db, migrations);
}
