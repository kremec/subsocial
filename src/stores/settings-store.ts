import "expo-sqlite/localStorage/install";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { type FeedPosition } from "@/screens/feed/feed-rows";
import { type PlatformId } from "@/types/post";

interface Settings {
  onboarded: boolean;
  hiddenPlatforms: PlatformId[];
  videosMuted: boolean;
  feedPosition?: FeedPosition;
  // Known posts per platform, kept until its collection succeeds so an
  // interrupted collection can still reach them later.
  collectionBoundaries: Partial<Record<PlatformId, string[]>>;
}

export const useSettingsStore = create<Settings>()(
  persist(
    (): Settings => ({
      onboarded: false,
      hiddenPlatforms: [],
      videosMuted: true,
      collectionBoundaries: {},
    }),
    {
      name: "subsocial.settings",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
