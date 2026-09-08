import { type FC } from "react";
import { Pressable, Text } from "react-native";

import ToastMessage, { type ToastConfig } from "react-native-toast-message";

import { useTheme } from "@/theme/use-theme";

export const showErrorToast = (message: string): void => {
  ToastMessage.show({
    type: "error",
    text1: "Couldn’t complete that",
    text2: message,
    onPress: ToastMessage.hide,
  });
};

export const Toast: FC = () => {
  const { colors } = useTheme();
  const config: ToastConfig = {
    error: (params) => {
      const { onPress, text1, text2 } = params;
      return (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={{
            width: "92%",
            maxWidth: 420,
            borderRadius: 14,
            backgroundColor: colors.errorSurface,
            gap: 4,
            padding: 14,
          }}
        >
          <Text style={{ color: colors.danger, fontWeight: "600" }}>
            {text1}
          </Text>
          <Text style={{ color: colors.text, lineHeight: 20 }}>{text2}</Text>
        </Pressable>
      );
    },
  };

  return <ToastMessage config={config} topOffset={56} />;
};
