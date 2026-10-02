import { type FC, useState } from "react";

import Storage from "expo-sqlite/kv-store";

import { listConnectedPlatforms, listFeedItems } from "@/feed/database";
import { FeedScreen } from "@/screens/feed/feed-screen";
import { OnboardingScreen } from "@/screens/onboarding/onboarding-screen";

const FeedRoute: FC = () => {
  const [onboardingComplete, setOnboardingComplete] = useState(() => {
    const status = Storage.getItemSync("onboarding-status");
    if (status) return status === "complete";

    const complete =
      listConnectedPlatforms().length > 0 || listFeedItems().length > 0;
    // Preserve unfinished setup even after sign-in saves the first connection.
    Storage.setItemSync("onboarding-status", complete ? "complete" : "pending");
    return complete;
  });

  if (!onboardingComplete) {
    return (
      <OnboardingScreen
        onContinue={() => {
          Storage.setItemSync("onboarding-status", "complete");
          setOnboardingComplete(true);
        }}
      />
    );
  }

  return <FeedScreen />;
};

export default FeedRoute;
