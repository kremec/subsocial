import { type FC } from "react";
import { View } from "react-native";

import { Typography } from "@/components/ui/typography";
import { type FeedAttachment } from "@/feed/types";
import { useTheme } from "@/theme/use-theme";

interface PostAttachmentProps {
  attachment: FeedAttachment;
  compact: boolean;
}

export const PostAttachment: FC<PostAttachmentProps> = (props) => {
  const { attachment, compact } = props;
  const theme = useTheme();
  const event = attachment.type === "event";
  const detail = event
    ? attachment.startsAtText
    : new URL(attachment.url).hostname.replace(/^www\./, "");

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {!!detail && (
        <Typography
          variant={event ? "caption" : "bodySmall"}
          color={theme.colors.textSecondary}
        >
          {detail}
        </Typography>
      )}
      <Typography
        variant={compact ? "bodySmall" : event ? "body" : "titleSmall"}
        style={{
          fontWeight: "400",
          lineHeight: compact ? 20 : event ? 23 : 24,
        }}
      >
        {attachment.title}
      </Typography>
      {!event && !!attachment.description && (
        <Typography
          variant="bodySmall"
          color={theme.colors.textSecondary}
          numberOfLines={2}
        >
          {attachment.description}
        </Typography>
      )}
    </View>
  );
};
