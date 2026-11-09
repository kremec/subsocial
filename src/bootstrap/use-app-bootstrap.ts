import { useEffect, useState } from "react";

import { migrateDatabase } from "@/db/database-migration";

export function useAppBootstrap() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    let active = true;
    void migrateDatabase().then(
      () => {
        if (active) setReady(true);
      },
      (error: Error) => {
        if (active) setError(error);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (error) throw error;
  return { ready };
}
