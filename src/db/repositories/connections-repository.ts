import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { connections } from "@/db/schema";
import { type PlatformId } from "@/types/platform-id";

export function connectPlatform(platform: PlatformId): void {
  db.insert(connections).values({ platform }).onConflictDoNothing().run();
}

export function disconnectPlatform(platform: PlatformId): void {
  db.delete(connections).where(eq(connections.platform, platform)).run();
}

export function listConnectedPlatforms(): PlatformId[] {
  return db
    .select()
    .from(connections)
    .orderBy(connections.platform)
    .all()
    .map((row) => row.platform);
}
