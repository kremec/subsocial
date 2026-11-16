import { type FC } from "react";

import { DateTimePicker, Host } from "@expo/ui/jetpack-compose";

import { type TimePickerProps } from "@/components/ui/time-picker";
import { useTheme } from "@/theme/use-theme";

export const TimePicker: FC<TimePickerProps> = (props) => {
  const { value, onChange } = props;
  const theme = useTheme();

  return (
    <Host matchContents={{ vertical: true }} colorScheme={theme.themeName}>
      <DateTimePicker
        initialDate={value.toISOString()}
        displayedComponents="hourAndMinute"
        is24Hour
        showVariantToggle={false}
        elementColors={{
          containerColor: "transparent",
          clockDialColor: theme.colors.backgroundElement,
          clockDialContentColor: theme.colors.text,
          clockDialSelectedContentColor: theme.colors.surface,
          selectorColor: theme.colors.textSecondary,
          timeSelectorSelectedContainerColor: theme.colors.accentSoft,
          timeSelectorContainerColor: theme.colors.backgroundElement,
          timeSelectorSelectedContentColor: theme.colors.text,
          timeSelectorContentColor: theme.colors.textSecondary,
        }}
        onDateSelected={(date) => {
          if (date) onChange(date);
        }}
      />
    </Host>
  );
};
