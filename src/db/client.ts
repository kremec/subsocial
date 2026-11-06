import { openDatabaseSync } from "expo-sqlite";

import { drizzle } from "drizzle-orm/expo-sqlite";

import { migrateDatabase } from "@/db/database-migration";

export const database = openDatabaseSync("subsocial.db");
database.execSync("PRAGMA journal_mode = WAL");
export const db = drizzle(database);
export const databaseReady = migrateDatabase(database);
