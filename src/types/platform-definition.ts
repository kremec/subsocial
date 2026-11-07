import { type IconName } from "@/components/ui/icon";
import { type FeedPage } from "@/types/feed-page";
import { type FeedRequest } from "@/types/feed-request";
import { type PlatformId } from "@/types/platform-id";

export interface PlatformDefinition {
  id: PlatformId;
  feed: (request: FeedRequest) => AsyncGenerator<FeedPage>;
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
