import { type FC, useState } from "react";

import Storage from "expo-sqlite/kv-store";

import { FeedScreen } from "@/screens/feed/feed-screen";
import { OnboardingScreen } from "@/screens/onboarding/onboarding-screen";

const FeedRoute: FC = () => {
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => Storage.getItemSync("onboarding-status") === "complete",
  );

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
