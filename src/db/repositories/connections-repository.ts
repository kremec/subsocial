import { database } from "@/db/client";
import { type PlatformId } from "@/feed/types";

export function connectPlatform(platform: PlatformId): void {
  database.runSync(
    "INSERT OR IGNORE INTO connections (platform) VALUES (?)",
    platform,
  );
}

export function disconnectPlatform(platform: PlatformId): void {
  database.runSync("DELETE FROM connections WHERE platform = ?", platform);
}

export function listConnectedPlatforms(): PlatformId[] {
  return database
    .getAllSync<{ platform: PlatformId }>(
      "SELECT platform FROM connections ORDER BY platform",
    )
    .map((row) => row.platform);
}
