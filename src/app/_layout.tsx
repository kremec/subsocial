import { type FC, Fragment, Suspense } from "react";

import { AppRoot } from "@/components/app-root";
import { AppStatusBar } from "@/components/app-status-bar";

const RootLayout: FC = () => {
  return (
    <Fragment>
      <AppStatusBar />
      <Suspense fallback={null}>
        <AppRoot />
      </Suspense>
    </Fragment>
  );
};

export default RootLayout;
