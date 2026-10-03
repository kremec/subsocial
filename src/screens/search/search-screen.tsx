import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { AppState, TextInput, View } from "react-native";

import { router, useFocusEffect, useIsFocused } from "expo-router";

import { type LegendListRef } from "@legendapp/list/react-native";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Screen } from "@/components/ui/screen";
import { listFeedItems } from "@/feed/database";
import { FeedList } from "@/screens/feed/components/feed-list";
import { useTheme } from "@/theme/use-theme";

export const SearchScreen: FC = () => {
  const theme = useTheme();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [items, setItems] = useState(listFeedItems);
  const [query, setQuery] = useState("");
  const list = useRef<LegendListRef>(null);
  const changeQuery = (text: string) => {
    if (list.current && list.current.getState().scroll !== 0)
      void list.current.scrollToOffset({ offset: 0, animated: false });
    setQuery(text);
  };
  useFocusEffect(
    useCallback(() => {
      const next = listFeedItems();
      setItems((current) =>
        current.length === next.length &&
        current.every((item, index) => item === next[index])
          ? current
          : next,
      );
    }, []),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => subscription.remove();
  }, []);

  return (
    <Screen style={{ paddingHorizontal: 0, paddingTop: 0, gap: 0 }}>
      <View
        style={{
          height: 56,
          paddingHorizontal: theme.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
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
              accessibilityLabel="Clear search"
              onPress={() => changeQuery("")}
              style={{
                borderWidth: 0,
                backgroundColor: "transparent",
                width: 36,
                height: 36,
              }}
            >
              <Icon
                name="circle-x"
                color={theme.colors.textSecondary}
                size={18}
              />
            </IconButton>
          )}
        </View>
        <IconButton
          accessibilityLabel="Close search"
          onPress={() => router.back()}
          style={({ pressed }) => ({
            borderWidth: 0,
            backgroundColor: "transparent",
            opacity: pressed ? 0.45 : 1,
          })}
        >
          <Icon
            name="x"
            color={theme.colors.text}
            size={24}
            strokeWidth={1.8}
          />
        </IconButton>
      </View>
      <FeedList
        items={items}
        visible={focused && foreground}
        query={query}
        listRef={list}
      />
    </Screen>
  );
};
