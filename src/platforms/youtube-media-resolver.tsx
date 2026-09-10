import {
  type FC,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { AppState, Platform, View } from "react-native";

import { useFocusEffect } from "expo-router";

import { WebView } from "react-native-webview";

import { youtubePlaybackMessageSchema } from "@/feed/schemas";
import { type FeedItem } from "@/feed/types";
import youtubePlaybackSetupScript from "@/platforms/extractors/youtube-playback-setup.injected.js";
import youtubePlaybackScript from "@/platforms/extractors/youtube-playback.injected.js";
import { desktopWebViewProps } from "@/platforms/webview-props";
import {
  youtubeStream,
  type YouTubeResolution,
} from "@/platforms/youtube-media";

interface PlaybackResult {
  id: string;
  resolution: YouTubeResolution;
}

export function useYouTubeMedia(
  activeItem: FeedItem | undefined,
  visible: boolean,
  canResolve: boolean,
) {
  const [result, setResult] = useState<PlaybackResult>();
  const item =
    visible && activeItem?.platform === "youtube" ? activeItem : undefined;
  const resolution =
    result && result.id === item?.id ? result.resolution : undefined;

  useFocusEffect(useCallback(() => () => setResult(undefined), []));
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") setResult(undefined);
    });
    return () => listener.remove();
  }, []);

  const resolve = (id: string, value: YouTubeResolution) => {
    setResult({ id, resolution: value });
  };
  const retry = () => setResult(undefined);
  const activate = (id: string | undefined) => {
    setResult((current) => (current?.id === id ? current : undefined));
  };
  const fail = () => {
    if (item) setResult({ id: item.id, resolution: { status: "error" } });
  };

  return {
    next: canResolve && item && !resolution ? item : undefined,
    resolution,
    resolve,
    retry,
    activate,
    fail,
  };
}

interface YouTubeMediaResolverProps {
  item: FeedItem;
  onResolve: (id: string, value: YouTubeResolution) => void;
}

export const YouTubeMediaResolver: FC<YouTubeMediaResolverProps> = (props) => {
  const { item, onResolve } = props;
  const completed = useRef(false);
  const finish = (value: YouTubeResolution) => {
    if (completed.current) return;
    completed.current = true;
    onResolve(item.id, value);
  };
  const onTimeout = useEffectEvent(() => finish({ status: "error" }));
  useEffect(() => {
    completed.current = false;
    const timeout = setTimeout(onTimeout, 15_000);
    return () => {
      completed.current = true;
      clearTimeout(timeout);
    };
  }, []);

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
        {...desktopWebViewProps}
        source={{
          uri: `https://www.youtube.com/watch?v=${encodeURIComponent(item.sourceId)}&hl=en`,
        }}
        injectedJavaScriptBeforeContentLoaded={`window.__subsocialPlatform = ${JSON.stringify(Platform.OS)};\n${youtubePlaybackSetupScript}\n${youtubePlaybackScript}`}
        injectedJavaScript={youtubePlaybackScript}
        onMessage={(event) => {
          if (completed.current) return;
          try {
            const message = youtubePlaybackMessageSchema.parse(
              JSON.parse(event.nativeEvent.data),
            );
            if (message.type === "youtube-stream")
              finish(youtubeStream(message.url));
            else if (message.type === "youtube-verification")
              finish({ status: "verification" });
            else if (message.type === "youtube-error")
              finish({ status: "error" });
          } catch {
            finish({ status: "error" });
          }
        }}
        onError={() => finish({ status: "error" })}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        style={{ width: 420, height: 820 }}
      />
    </View>
  );
};
