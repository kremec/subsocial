import "expo-sqlite/localStorage/install";
import { create } from "zustand";
import { combine, createJSONStorage, persist } from "zustand/middleware";

import { settingsSchema, type Settings } from "@/types/settings";

export const useSettingsStore = create(
  persist(
    combine({ settings: settingsSchema.parse({}) }, (set, get) => ({
      updateSettings: (patch: Partial<Settings>) => {
        set({ settings: { ...get().settings, ...patch } });
      },
    })),
    {
      name: "subsocial.settings",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (saved, version) => {
        if (version < 1) {
          return {
            settings: { ...settingsSchema.parse({}), ...(saved as Settings) },
          };
        }

        return saved as { settings: Settings };
      },
    },
  ),
);
