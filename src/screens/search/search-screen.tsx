import { type FC, useRef, useState } from "react";
import { TextInput, View } from "react-native";

import { router, useIsFocused } from "expo-router";

import { type LegendListRef } from "@legendapp/list/react-native";

import { ScreenHeader } from "@/components/screen-header";
import { Icon, IconName } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Screen } from "@/components/ui/screen";
import { useFeedItems } from "@/feed/use-feed-items";
import { FeedList } from "@/screens/feed/components/feed-list";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";

export const SearchScreen: FC = () => {
  const theme = useTheme();
  const focused = useIsFocused();
  const { items } = useFeedItems();
  const [query, setQuery] = useState("");
  const list = useRef<LegendListRef>(null);
  const changeQuery = (text: string) => {
    void list.current?.scrollToOffset({ offset: 0, animated: false });
    setQuery(text);
  };

  return (
    <Screen style={{ paddingHorizontal: 0, paddingTop: 0, gap: 0 }}>
      <ScreenHeader onBack={() => router.back()}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.backgroundElement,
            borderRadius: theme.radius.sm,
            paddingLeft: theme.spacing.md,
          }}
        >
          <TextInput
            accessibilityLabel={t("feedSearch")}
            placeholder={t("feedSearch")}
            placeholderTextColor={theme.colors.textSecondary}
            value={query}
            onChangeText={changeQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{
              flex: 1,
              color: theme.colors.text,
              fontSize: theme.typography.body.fontSize,
              minHeight: 44,
              paddingVertical: theme.spacing.sm,
            }}
          />
          {!!query && (
            <IconButton
              plain
              size={44}
              accessibilityLabel={t("searchClear")}
              onPress={() => changeQuery("")}
            >
              <Icon
                name={IconName.CIRCLE_X}
                color={theme.colors.textSecondary}
                size={18}
              />
            </IconButton>
          )}
        </View>
      </ScreenHeader>
      <FeedList items={items} visible={focused} query={query} listRef={list} />
    </Screen>
  );
};
