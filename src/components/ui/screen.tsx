import { type FC, type PropsWithChildren } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/theme/use-theme";

interface ScreenProps {
  style?: StyleProp<ViewStyle>;
}

export const Screen: FC<PropsWithChildren<ScreenProps>> = (props) => {
  const { children, style } = props;
  const theme = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={[
          {
            flex: 1,
            width: "100%",
            maxWidth: theme.layout.screenMaxWidth,
            alignSelf: "center",
          },
          style,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
};
