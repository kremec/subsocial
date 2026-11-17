import { useEffect, useState } from "react";

import { addDatabaseChangeListener } from "expo-sqlite";

import { listFeedItems } from "@/feed/feed-rows";

export function useFeedItems() {
  const [items, setItems] = useState(listFeedItems);

  useEffect(() => {
    let frame: number | undefined;
    const refresh = () => {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        setItems(listFeedItems());
      });
    };
    const listener = addDatabaseChangeListener(({ tableName }) => {
      if (tableName === "feed_items") refresh();
    });
    refresh();
    return () => {
      listener.remove();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, []);

  return items;
}
