import { type FC, useRef, useState } from "react";
import { TextInput, View } from "react-native";

import { router, useIsFocused } from "expo-router";

import { type LegendListRef } from "@legendapp/list/react-native";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { ModalHeader } from "@/components/ui/modal-header";
import { Screen } from "@/components/ui/screen";
import { listFeedItems } from "@/feed/database";
import { FeedList } from "@/screens/feed/components/feed-list";
import { useTheme } from "@/theme/use-theme";

export const SearchScreen: FC = () => {
  const theme = useTheme();
  const focused = useIsFocused();
  const [items] = useState(listFeedItems);
  const [query, setQuery] = useState("");
  const list = useRef<LegendListRef>(null);
  const changeQuery = (text: string) => {
    if (list.current && list.current.getState().scroll !== 0)
      void list.current.scrollToOffset({ offset: 0, animated: false });
    setQuery(text);
  };

  return (
    <Screen>
      <ModalHeader closeLabel="Close search" onClose={() => router.back()}>
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
            accessibilityLabel="Search feed"
            placeholder="Search feed"
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
              fontSize: theme.typography.body,
              paddingVertical: theme.spacing.sm,
            }}
          />
          {!!query && (
            <IconButton
              plain
              size={36}
              accessibilityLabel="Clear search"
              onPress={() => changeQuery("")}
            >
              <Icon
                name="circle-x"
                color={theme.colors.textSecondary}
                size={18}
              />
            </IconButton>
          )}
        </View>
      </ModalHeader>
      <FeedList items={items} visible={focused} query={query} listRef={list} />
    </Screen>
  );
};
