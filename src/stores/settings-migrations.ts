import { settingsSchema, type Settings } from "@/types/settings";

export function migrateSettings(saved: unknown, version: number) {
  if (version < 1) {
    return {
      settings: { ...settingsSchema.parse({}), ...(saved as Settings) },
    };
  }

  return saved as { settings: Settings };
}
