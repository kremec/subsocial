import { type FC, useEffect, useState } from "react";
import { AppState } from "react-native";

import { Typography } from "@/components/ui/typography";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";

interface PostAgeProps {
  publishedAt: number;
}

export const PostAge: FC<PostAgeProps> = (props) => {
  const { publishedAt } = props;
  const theme = useTheme();
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = () => setNow(Date.now());
    const updateTimer = (state: typeof AppState.currentState) => {
      clearInterval(timer);
      timer = state === "active" ? setInterval(refresh, 1000) : undefined;
    };
    const listener = AppState.addEventListener("change", (state) => {
      updateTimer(state);
      if (state === "active") refresh();
    });
    updateTimer(AppState.currentState);

    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, []);

  const formatAge = () => {
    const seconds = Math.max(0, Math.floor((now - publishedAt) / 1000));
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

  return (
    <Typography variant="caption" color={theme.colors.textSecondary}>
      {formatAge()}
    </Typography>
  );
};
