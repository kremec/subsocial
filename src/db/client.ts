import { openDatabaseSync } from "expo-sqlite";

import migrations from "@drizzle/migrations";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";

export const database = openDatabaseSync("subsocial.db");
database.execSync("PRAGMA journal_mode = WAL");
export const db = drizzle(database);
export const databaseReady = migrate(db, migrations);
