import "expo-sqlite/localStorage/install";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { type FeedPosition } from "@/screens/feed/feed-rows";
import { type PlatformId } from "@/types/platform-id";

interface Settings {
  onboarded: boolean;
  hiddenPlatforms: PlatformId[];
  videosMuted: boolean;
  feedPosition?: FeedPosition;
}

export const useSettingsStore = create<Settings>()(
  persist(
    (): Settings => ({
      onboarded: false,
      hiddenPlatforms: [],
      videosMuted: true,
    }),
    {
      name: "subsocial.settings",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
