import { type FC, Suspense } from "react";

import { AppRoot } from "@/components/app-root";
import { AppStatusBar } from "@/components/app-status-bar";
import { ThemeProvider } from "@/theme/provider";

const RootLayout: FC = () => {
  return (
    <ThemeProvider>
      <AppStatusBar />
      <Suspense fallback={null}>
        <AppRoot />
      </Suspense>
    </ThemeProvider>
  );
};

export default RootLayout;
