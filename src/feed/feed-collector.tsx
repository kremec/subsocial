import { type FC, useEffectEvent, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { WebView, type WebViewMessageEvent } from "react-native-webview";

import {
  CollectionProgress,
  datedExtraction,
  collectionTimeout,
  type ExtractionMessage,
} from "@/feed/collection";
import collectionScript from "@/feed/collection.injected.js";
import {
  listPublicationDates,
  listPendingYouTubeItems,
  saveExtraction,
} from "@/feed/database";
import { extractionMessageSchema } from "@/feed/schemas";
import {
  desktopUserAgent,
  type PlatformDefinition,
} from "@/platforms/platforms";

export interface CollectionResult {
  platform: PlatformDefinition["id"];
  durationMs: number;
  finishedAt: number;
  firstItemsMs?: number;
  items: number;
  error?: string;
}

interface FeedCollectorProps {
  platform: PlatformDefinition;
  known: string[];
  onFinish: (result: CollectionResult) => void;
}

export const FeedCollector: FC<FeedCollectorProps> = (props) => {
  const { platform, known, onFinish } = props;
  const [dates] = useState(() => new Map(listPublicationDates(platform.id)));
  const [pendingYouTube] = useState(() =>
    platform.id === "youtube" ? listPendingYouTubeItems() : [],
  );
  const [startedAt] = useState(() => performance.now());
  const firstItemsMs = useRef<number>(undefined);
  const failures = useRef(new Set<string>());
  const webView = useRef<WebView>(null);
  const [progress] = useState(() => new CollectionProgress(new Set(known)));
  const finished = useRef(false);
  const finish = (error?: string) => {
    if (finished.current) return;
    finished.current = true;
    const finishedAt = performance.now();
    onFinish({
      platform: platform.id,
      durationMs: Math.round(finishedAt - startedAt),
      finishedAt,
      firstItemsMs: firstItemsMs.current,
      items: progress.seen.size,
      error:
        error ||
        (failures.current.size
          ? `Publication dates unavailable for ${failures.current.size} posts. Pull to retry.`
          : undefined),
    });
  };
  const onTimeout = useEffectEvent(() =>
    finish("Refresh timed out. Pull to retry."),
  );

  useEffect(() => {
    finished.current = false;
    const timeout = setTimeout(onTimeout, collectionTimeout);
    return () => {
      finished.current = true;
      clearTimeout(timeout);
    };
  }, []);

  const handleMessage = (event: WebViewMessageEvent) => {
    if (finished.current) return;
    let message: ExtractionMessage;
    try {
      const parsed = extractionMessageSchema.safeParse(
        JSON.parse(event.nativeEvent.data),
      );
      if (!parsed.success) {
        finish("Could not read posts. Pull to retry.");
        return;
      }
      message = parsed.data;
    } catch {
      finish("Could not read posts. Pull to retry.");
      return;
    }
    if (message.type === "error") {
      finish(
        "Could not load posts. Open the platform to check your connection.",
      );
      return;
    }
    for (const id of message.failedSourceIds ?? []) failures.current.add(id);
    for (const item of message.items) failures.current.delete(item.sourceId);
    const dated = datedExtraction(message.items, dates);
    for (const id of dated.failedSourceIds) failures.current.add(id);
    for (const item of dated.items) {
      failures.current.delete(item.sourceId);
      for (const post of item.thread ?? [])
        failures.current.delete(post.sourceId);
    }
    const batch = progress.accept({ ...message, items: dated.items });
    if (batch.items.length && firstItemsMs.current === undefined)
      firstItemsMs.current = Math.round(performance.now() - startedAt);
    if (batch.items.length || batch.excludedSourceIds.length) {
      saveExtraction(
        platform.id,
        batch.items,
        batch.excludedSourceIds,
        batch.fetchedAt,
      );
    }
    if (batch.stop) finish();
    else if (batch.complete) {
      // Keep the first viewport in place until its posts have hydrated.
      const advance = batch.advance || dated.failedSourceIds.length > 0;
      webView.current?.injectJavaScript(
        `window.__subsocialNextViewport(${advance}); true;`,
      );
    }
  };

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 420,
        height: 820,
        opacity: 0,
        transform: [{ translateX: -10_000 }],
      }}
    >
      <WebView
        ref={webView}
        source={{ uri: platform.startUrl }}
        originWhitelist={["about:*", "http://*", "https://*"]}
        userAgent={desktopUserAgent}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        webviewDebuggingEnabled={__DEV__}
        injectedJavaScript={`
          window.__subsocialKnownSourceIds = ${JSON.stringify(known)};
          window.__subsocialYoutubeDates = new Map(${JSON.stringify([...dates])});
          window.__subsocialPendingYoutubeItems = ${JSON.stringify(pendingYouTube)};
          ${collectionScript}
          window.__subsocialStartCollection(() => {
            return ${platform.extractScript}
          });
          true;
        `}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={(request) => {
          if (
            platform.id === "youtube" &&
            request.url.startsWith("https://accounts.google.com/")
          ) {
            finish("YouTube is signed out. Open it to sign in and retry.");
            return false;
          }
          return true;
        }}
        onError={() =>
          finish("Could not load posts. Check your connection and retry.")
        }
        onHttpError={(event) => {
          if (
            event.nativeEvent.url === platform.startUrl &&
            event.nativeEvent.statusCode >= 400
          )
            finish("The platform could not load. Open it to check your login.");
        }}
        style={{ width: 420, height: 820 }}
      />
    </View>
  );
};
