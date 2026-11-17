import { useEffect, useRef, useState } from "react";

import { addDatabaseChangeListener } from "expo-sqlite";

import { listFeedItems } from "@/feed/feed-rows";

export function useFeedItems() {
  const [items, setItems] = useState(listFeedItems);
  const deferred = useRef(false);

  useEffect(() => {
    let frame: number | undefined;
    const refresh = () => {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        if (!deferred.current) setItems(listFeedItems());
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

  const deferUpdates = (defer: boolean) => {
    if (defer === deferred.current) return;
    deferred.current = defer;
    if (!defer) setItems(listFeedItems());
  };

  return { items, deferUpdates };
}
