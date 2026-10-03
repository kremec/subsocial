import { type ComponentType, type FC } from "react";

import {
  IconArrowsMinimize,
  IconArrowsMaximize,
  IconArrowUp,
  IconCheck,
  IconCircleX,
  IconChevronRight,
  IconDots,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconExternalLink,
  IconFileExport,
  IconFileImport,
  IconLogout,
  IconRepeat,
  IconSearch,
  IconVolume,
  IconVolumeOff,
  IconWorld,
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandReddit,
  IconBrandX,
  IconBrandYoutube,
  IconPlayerPlay,
  IconPlayerPause,
  IconX,
} from "@tabler/icons-react-native";
import type { IconProps } from "@tabler/icons-react-native";

const icons = {
  "arrow-up": IconArrowUp,
  check: IconCheck,
  "circle-x": IconCircleX,
  "chevron-right": IconChevronRight,
  compact: IconArrowsMinimize,
  fullscreen: IconArrowsMaximize,
  dots: IconDots,
  download: IconDownload,
  eye: IconEye,
  "eye-off": IconEyeOff,
  "external-link": IconExternalLink,
  "file-export": IconFileExport,
  "file-import": IconFileImport,
  logout: IconLogout,
  repeat: IconRepeat,
  search: IconSearch,
  volume: IconVolume,
  "volume-off": IconVolumeOff,
  world: IconWorld,
  "brand-facebook": IconBrandFacebook,
  "brand-instagram": IconBrandInstagram,
  "brand-reddit": IconBrandReddit,
  "brand-x": IconBrandX,
  "brand-youtube": IconBrandYoutube,
  "player-play": IconPlayerPlay,
  "player-pause": IconPlayerPause,
  x: IconX,
} satisfies Record<string, ComponentType<IconProps>>;

export type IconName = keyof typeof icons;

interface AppIconProps extends IconProps {
  name: IconName;
  filled?: boolean;
}

export const Icon: FC<AppIconProps> = (props) => {
  const { name, filled = false, strokeWidth, ...iconProps } = props;
  const Component = icons[name];

  return (
    <Component
      {...iconProps}
      fill={filled ? iconProps.color : "transparent"}
      strokeWidth={filled ? 0 : (strokeWidth ?? 1.8)}
    />
  );
};
