import { type FC, useState, useSyncExternalStore } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { Typography } from "@/components/ui/typography";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";

// Share one foreground timer across mounted labels, independent of row renders.
let now: number | undefined;
const listeners = new Set<() => void>();
let stopClock: (() => void) | undefined;

function startClock() {
  let timer: ReturnType<typeof setInterval> | undefined;
  const tick = () => {
    now = Date.now();
    listeners.forEach((listener) => listener());
  };
  const updateAppState = (state: AppStateStatus) => {
    clearInterval(timer);
    timer = undefined;
    if (state !== "active") return;
    timer = setInterval(tick, 1000);
    tick();
  };
  now = Date.now();
  const appState = AppState.addEventListener("change", updateAppState);
  if (AppState.currentState === "active") timer = setInterval(tick, 1000);
  return () => {
    clearInterval(timer);
    appState.remove();
    now = undefined;
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) stopClock = startClock();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stopClock?.();
      stopClock = undefined;
    }
  };
}

const formatAge = (publishedAt: number, currentTime: number) => {
  const seconds = Math.max(0, Math.floor((currentTime - publishedAt) / 1000));
  if (seconds < 60) return t("feedAgeSeconds", { count: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("feedAgeMinutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("feedAgeHours", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("feedAgeDays", { count: days });
  if (days < 30) return t("feedAgeWeeks", { count: Math.floor(days / 7) });
  if (days < 365) return t("feedAgeMonths", { count: Math.floor(days / 30) });
  return t("feedAgeYears", { count: Math.floor(days / 365) });
};

interface PostAgeProps {
  publishedAt: number;
}

export const PostAge: FC<PostAgeProps> = (props) => {
  const { publishedAt } = props;
  const theme = useTheme();
  const [mountedAt] = useState(Date.now);
  const age = useSyncExternalStore(subscribe, () =>
    formatAge(publishedAt, now ?? mountedAt),
  );

  return (
    <Typography variant="caption" color={theme.colors.textSecondary}>
      {age}
    </Typography>
  );
};
