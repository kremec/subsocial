import { migrate } from "drizzle-orm/expo-sqlite/migrator";

import { db } from "@/db/client";
import migrations from "@drizzle/migrations";

export async function migrateDatabase(): Promise<void> {
  await migrate(db, migrations);
}
