import "expo-sqlite/localStorage/install";
import { create } from "zustand";
import { combine, createJSONStorage, persist } from "zustand/middleware";

import { settingsSchema, type Settings } from "@/types/settings";

export const useSettingsStore = create(
  persist(
    combine(settingsSchema.parse({}), (set) => ({
      updateSettings: (patch: Partial<Settings>) => set(patch),
    })),
    {
      name: "subsocial.settings",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
