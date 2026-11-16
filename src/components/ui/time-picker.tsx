import { type FC } from "react";

import { DateTimePicker } from "@expo/ui/community/datetime-picker";

import { useTheme } from "@/theme/use-theme";

export interface TimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
}

export const TimePicker: FC<TimePickerProps> = (props) => {
  const { value, onChange } = props;
  const theme = useTheme();

  return (
    <DateTimePicker
      value={value}
      mode="time"
      presentation="inline"
      is24Hour
      display="spinner"
      themeVariant={theme.themeName}
      accentColor={theme.colors.accent}
      onValueChange={(_, date) => onChange(date)}
    />
  );
};
