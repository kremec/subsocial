import { type SQLiteDatabase } from "expo-sqlite";

import migrations from "@drizzle/migrations";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";

import { t } from "@/translation/use-translation";

export async function migrateDatabase(
  connection: SQLiteDatabase,
): Promise<void> {
  const version = connection.getFirstSync<{ user_version: number }>(
    "PRAGMA user_version",
  )!.user_version;
  if (version > 4) throw new Error(t("databaseRequiresNewerApp"));

  if (
    connection.getFirstSync(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
  ) {
    const latest = connection.getFirstSync<{ created_at: number }>(
      "SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1",
    );
    if ((latest?.created_at ?? 0) > migrations.journal.entries.at(-1)!.when)
      throw new Error(t("databaseRequiresNewerApp"));
  }

  await migrate(drizzle(connection), migrations);
}
