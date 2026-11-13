import { openDatabaseSync } from "expo-sqlite";

import { drizzle } from "drizzle-orm/expo-sqlite";

export const expoDb = openDatabaseSync("subsocial.db");
expoDb.execSync("PRAGMA journal_mode = WAL");
export const db = drizzle(expoDb);
