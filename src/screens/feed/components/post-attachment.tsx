import { type FC } from "react";
import { View } from "react-native";

import { Typography } from "@/components/ui/typography";
import { useTheme } from "@/theme/use-theme";
import { type FeedAttachment } from "@/types/feed-attachment";

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
        variant={
          compact
            ? "bodySmallRelaxed"
            : event
              ? "bodyRegular"
              : "titleSmallRegular"
        }
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
