import { useState } from "react";

import { initializeDatabase } from "@/feed/database";

// Opening the database is synchronous, so routes can mount on the first render.
export function useAppBootstrap() {
  const [error] = useState(() => {
    try {
      initializeDatabase();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });

  return { error };
}
