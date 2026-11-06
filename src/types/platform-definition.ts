import { type IconName } from "@/components/ui/icon";
import { type PlatformId } from "@/types/platform-id";

export interface PlatformDefinition {
  id: PlatformId;
  icon: IconName;
  label: string;
  color: string;
  startUrl: string;
  androidPackage: string | null;
  androidAppUrl: string;
  appScheme: string;
  loginUrl: string;
  dataDomains: string[];
  sessionCookieGroups: readonly (readonly string[])[];
}
