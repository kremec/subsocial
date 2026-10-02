import { useEffect, useState } from "react";

import { initializeDatabase } from "@/feed/database";

export function useAppBootstrap() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void Promise.resolve()
      .then(initializeDatabase)
      .then(() => setReady(true))
      .catch((error) =>
        setError(error instanceof Error ? error.message : String(error)),
      );
  }, []);

  return { ready, error };
}
