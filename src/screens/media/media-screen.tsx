import {
  type FC,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Image } from "expo-image";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";

import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { feedMediaSchema } from "@/feed/schemas";
import { type PlatformId } from "@/feed/types";
import { openBrowser, openPost } from "@/platforms/open-post";
import {
  withYouTubeStream,
  youtubePlaybackStatus,
} from "@/platforms/youtube/media";
import { useYouTubeMedia } from "@/platforms/youtube/media-resolver";
import { FeedVideo } from "@/screens/feed/components/feed-video";
import { FullscreenImage } from "@/screens/feed/components/fullscreen-image";
import { MediaDownloadButton } from "@/screens/feed/components/media-download-button";
import { canDownloadMedia } from "@/screens/feed/download-media";
import { MediaAlbumContext } from "@/screens/media/media-video-provider";

export const MediaScreen: FC = () => {
  const {
    media: encodedMedia,
    postUrl,
    platform,
    androidUrl,
    index,
    sourceId,
  } = useLocalSearchParams<{
    media: string;
    postUrl: string;
    platform: PlatformId;
    androidUrl?: string;
    index: string;
    sourceId?: string;
  }>();
  const routeMedia = useMemo(
    () => feedMediaSchema.array().parse(JSON.parse(encodedMedia)),
    [encodedMedia],
  );
  const focused = useIsFocused();
  const youtubeItem = sourceId
    ? { id: `${platform}:${sourceId}`, sourceId, platform }
    : undefined;
  const youtube = useYouTubeMedia(youtubeItem, focused);
  const media = withYouTubeStream(
    { platform, media: routeMedia },
    youtube.resolution,
  ).media;
  const [mediaIndex, setMediaIndex] = useState(Number(index));
  const selectedMedia = media[mediaIndex]!;
  const [width, setWidth] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const carousel = useRef<ScrollView>(null);
  const album = useContext(MediaAlbumContext);
  const setSelection = album?.setSelection;
  useEffect(() => () => setSelection?.(undefined), [setSelection]);
  const pagingGesture = useMemo(() => Gesture.Native(), []);
  const closeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!zoomed)
        .maxPointers(1)
        .activeOffsetY(80)
        .failOffsetX([-20, 20])
        .simultaneousWithExternalGesture(pagingGesture)
        .runOnJS(true)
        .onEnd((event) => {
          if (event.translationY > 80) router.back();
        }),
    [zoomed, pagingGesture],
  );

  const navigationGestures = useMemo(
    () => [pagingGesture, closeGesture],
    [pagingGesture, closeGesture],
  );

  return (
    <GestureDetector gesture={closeGesture}>
      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ flex: 1, backgroundColor: "black" }}
      >
        {width > 0 && (
          <GestureDetector gesture={pagingGesture}>
            <ScrollView
              ref={carousel}
              horizontal
              pagingEnabled
              scrollEnabled={!zoomed && media.length > 1}
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: mediaIndex * width, y: 0 }}
              onContentSizeChange={() =>
                carousel.current?.scrollTo({
                  x: mediaIndex * width,
                  animated: false,
                })
              }
              onMomentumScrollEnd={(event) => {
                const selectedIndex = Math.round(
                  event.nativeEvent.contentOffset.x / width,
                );
                setMediaIndex(selectedIndex);
                setSelection?.({ postUrl, index: selectedIndex });
              }}
              style={{ flex: 1 }}
            >
              {media.map((item, itemIndex) => (
                <View
                  key={`${item.url}:${itemIndex}`}
                  style={{ width, height: "100%" }}
                >
                  {Math.abs(itemIndex - mediaIndex) <= 1 &&
                    (item.type === "image" ? (
                      <FullscreenImage
                        uri={item.url}
                        aspectRatio={item.aspectRatio}
                        onClose={() => router.back()}
                        onZoomChange={
                          itemIndex === mediaIndex ? setZoomed : undefined
                        }
                      />
                    ) : (
                      <View style={{ flex: 1 }}>
                        {!!item.posterUrl && (
                          <Image
                            source={{ uri: item.posterUrl }}
                            contentFit="contain"
                            style={{ position: "absolute", inset: 0 }}
                          />
                        )}
                        {focused && itemIndex === mediaIndex && (
                          <SafeAreaView style={{ flex: 1 }}>
                            {item.playable ? (
                              <FeedVideo
                                key={item.url}
                                playbackKey={`${postUrl}:${itemIndex}`}
                                media={item}
                                fullscreen
                                playbackStatus={
                                  youtubeItem &&
                                  youtubePlaybackStatus(
                                    youtubeItem,
                                    youtube.resolution,
                                  )
                                }
                                onError={
                                  platform === "youtube" && youtubeItem
                                    ? () => youtube.fail(youtubeItem.id)
                                    : undefined
                                }
                                onRetry={
                                  platform === "youtube"
                                    ? youtube.retry
                                    : undefined
                                }
                                onVerification={() =>
                                  openBrowser(platform, postUrl)
                                }
                                navigationGestures={navigationGestures}
                              />
                            ) : (
                              <Pressable
                                accessibilityRole="button"
                                onPress={() =>
                                  void openPost(platform, postUrl, androidUrl)
                                }
                                style={{
                                  flex: 1,
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Typography
                                  style={{
                                    color: "white",
                                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                                    padding: 16,
                                  }}
                                >
                                  Open video in original post
                                </Typography>
                              </Pressable>
                            )}
                          </SafeAreaView>
                        )}
                      </View>
                    ))}
                </View>
              ))}
            </ScrollView>
          </GestureDetector>
        )}
        <SafeAreaView
          pointerEvents="box-none"
          style={{ position: "absolute", inset: 0, padding: 16 }}
        >
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <View>
              {canDownloadMedia(selectedMedia) &&
                (selectedMedia.type === "image" || selectedMedia.playable) && (
                  <MediaDownloadButton media={selectedMedia} />
                )}
            </View>
            <IconButton
              accessibilityLabel="Close fullscreen"
              onPress={() => router.back()}
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                borderColor: "rgba(255, 255, 255, 0.3)",
              }}
            >
              <Icon name="x" color="white" size={24} />
            </IconButton>
          </View>
        </SafeAreaView>
        {media.length > 1 && (
          <SafeAreaView
            pointerEvents="none"
            style={{ position: "absolute", top: 16, alignSelf: "center" }}
          >
            <Typography
              variant="caption"
              style={{
                color: "white",
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 12,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
              }}
            >
              {mediaIndex + 1}/{media.length}
            </Typography>
          </SafeAreaView>
        )}
      </View>
    </GestureDetector>
  );
};
