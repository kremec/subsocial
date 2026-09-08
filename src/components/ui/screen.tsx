import { type FC, type PropsWithChildren } from "react";
import {
  Platform,
  ScrollView,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";

import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { useTheme } from "@/theme/use-theme";

interface ScreenProps {
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Screen: FC<PropsWithChildren<ScreenProps>> = (props) => {
  const { children, scroll = false, style } = props;
  const theme = useTheme();
  const safeAreaEdges: Edge[] =
    Platform.OS === "ios"
      ? ["top", "left", "right", "bottom"]
      : ["top", "left", "right"];
  const contentStyle = {
    width: "100%" as const,
    maxWidth: theme.layout.screenMaxWidth,
    alignSelf: "center" as const,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.layout.bottomInset,
    gap: theme.spacing.lg,
  };

  return (
    <SafeAreaView
      edges={safeAreaEdges}
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
      }}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={[contentStyle, style]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            contentStyle,
            {
              flex: 1,
            },
            style,
          ]}
        >
          {children}
        </View>
      )}
    </SafeAreaView>
  );
};
