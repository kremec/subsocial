import { type FC, Fragment } from "react";

import { FeedScreen } from "@/screens/feed/feed-screen";
import { OnboardingScreen } from "@/screens/onboarding/onboarding-screen";
import { useSettingsStore } from "@/stores/settings-store";

const FeedRoute: FC = () => {
  const onboarded = useSettingsStore((state) => state.settings.onboarded);

  return (
    <Fragment>
      {onboarded && <FeedScreen />}
      {!onboarded && <OnboardingScreen />}
    </Fragment>
  );
};

export default FeedRoute;
