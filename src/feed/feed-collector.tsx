import { type FC, useEffectEvent, useEffect, useRef, useState } from "react";
import { BackHandler, View } from "react-native";

import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
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
import { type PlatformDefinition } from "@/platforms/platforms";
import { desktopWebViewProps } from "@/platforms/webview-props";
import { useTheme } from "@/theme/use-theme";

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
  active: boolean;
  attention: boolean;
  open: boolean;
  onAttention: (needed: boolean) => void;
  onClose: () => void;
  onFinish: (result: CollectionResult) => void;
}

export const FeedCollector: FC<FeedCollectorProps> = (props) => {
  const {
    platform,
    known,
    active,
    attention,
    open,
    onAttention,
    onClose,
    onFinish,
  } = props;
  const theme = useTheme();
  const needsAttention = useRef(attention);
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
    return () => {
      finished.current = true;
    };
  }, []);

  useEffect(() => {
    if (!active || attention) return;
    const timeout = setTimeout(onTimeout, collectionTimeout);
    return () => clearTimeout(timeout);
  }, [active, attention]);

  useEffect(() => {
    webView.current?.injectJavaScript(
      `window.__subsocialCollectionActive = ${active}; window.__subsocialCheckPage?.(); true;`,
    );
  }, [active]);

  const resume = () => {
    needsAttention.current = false;
    onAttention(false);
    onClose();
  };
  const close = () => {
    resume();
    webView.current?.injectJavaScript(
      `window.__subsocialCollectionActive = false; window.location.replace(${JSON.stringify(platform.startUrl)}); true;`,
    );
  };
  const closeOnBack = useEffectEvent(close);
  useEffect(() => {
    if (!open || !active) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      closeOnBack();
      return true;
    });
    return () => listener.remove();
  }, [open, active]);

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
    if (message.type === "attention") {
      if (!needsAttention.current) {
        needsAttention.current = true;
        onAttention(true);
      }
      return;
    }
    if (message.type === "ready") {
      if (needsAttention.current) resume();
      webView.current?.injectJavaScript(
        "window.__subsocialResumeCollection(); true;",
      );
      return;
    }
    if (needsAttention.current || !active) return;
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

  const script = `
    window.__subsocialFeedUrl = ${JSON.stringify(platform.startUrl)};
    window.__subsocialNeedsAttention ??= ${attention};
    window.__subsocialCollectionActive = ${active};
    window.__subsocialKnownSourceIds = ${JSON.stringify(known)};
    window.__subsocialYoutubeDates ??= new Map(${JSON.stringify([...dates])});
    window.__subsocialPendingYoutubeItems ??= ${JSON.stringify(pendingYouTube)};
    ${collectionScript}
    window.__subsocialStartCollection(() => {
      return ${platform.extractScript}
    });
    true;
  `;
  const shown = open && active;

  return (
    <View
      pointerEvents={shown ? "auto" : "none"}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: shown ? "100%" : 420,
        height: shown ? "100%" : 820,
        opacity: shown ? 1 : 0,
        transform: [{ translateX: shown ? 0 : -10_000 }],
        zIndex: shown ? 2 : 0,
        backgroundColor: theme.colors.background,
      }}
    >
      {shown && (
        <View
          style={{
            height: 56,
            paddingHorizontal: theme.spacing.md,
            flexDirection: "row",
            alignItems: "center",
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <Typography style={{ flex: 1, fontWeight: "600" }}>
            {platform.label}
          </Typography>
          <IconButton
            onPress={close}
            style={{ borderWidth: 0, backgroundColor: "transparent" }}
          >
            <Icon
              name="x"
              color={theme.colors.text}
              size={24}
              strokeWidth={1.8}
            />
          </IconButton>
        </View>
      )}
      <WebView
        key="collector"
        {...desktopWebViewProps}
        ref={webView}
        source={{ uri: platform.startUrl }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        webviewDebuggingEnabled={__DEV__}
        injectedJavaScript={script}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={(request) =>
          /^(https?:|about:)/.test(request.url)
        }
        onNavigationStateChange={() =>
          webView.current?.injectJavaScript(
            "window.__subsocialCheckPage?.(); true;",
          )
        }
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
        style={{ flex: 1 }}
      />
    </View>
  );
};
