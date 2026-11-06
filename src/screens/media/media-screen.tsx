import { type FC, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  View,
  type ScrollViewInstance,
} from "react-native";

import { Image } from "expo-image";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";

import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon, IconName } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { openPost } from "@/platforms/open-post";
import { FeedVideo } from "@/screens/feed/components/feed-video";
import { FullscreenImage } from "@/screens/feed/components/fullscreen-image";
import {
  canDownloadMedia,
  MediaDownloadButton,
} from "@/screens/feed/components/media-download-button";
import { useMediaStore } from "@/stores/media-store";
import { t } from "@/translation/use-translation";
import { feedMediaSchema } from "@/types/feed-media";
import { type PlatformId } from "@/types/platform-id";

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
  const media = feedMediaSchema.array().parse(JSON.parse(encodedMedia));
  const focused = useIsFocused();
  const [mediaIndex, setMediaIndex] = useState(Number(index));
  const selectedMedia = media[mediaIndex]!;
  const [width, setWidth] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const carousel = useRef<ScrollViewInstance>(null);
  const pagingGesture = Gesture.Native();
  const closeGesture = Gesture.Pan()
    .enabled(!zoomed)
    .maxPointers(1)
    .activeOffsetY(80)
    .failOffsetX([-20, 20])
    .simultaneousWithExternalGesture(pagingGesture)
    .runOnJS(true)
    .onEnd((event) => {
      if (event.translationY > 80) router.back();
    });
  const navigationGestures = [pagingGesture, closeGesture];

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
                useMediaStore.setState({
                  album: { postUrl, index: selectedIndex },
                });
              }}
              style={{ flex: 1 }}
            >
              {media.map((item, itemIndex) => (
                <View
                  key={`${item.url}:${itemIndex}`}
                  style={{ width, height: "100%" }}
                >
                  {Math.abs(itemIndex - mediaIndex) <= 1 &&
                    item.type === "image" && (
                      <FullscreenImage
                        uri={item.url}
                        aspectRatio={item.aspectRatio}
                        onZoomChange={
                          itemIndex === mediaIndex ? setZoomed : undefined
                        }
                      />
                    )}
                  {Math.abs(itemIndex - mediaIndex) <= 1 &&
                    item.type !== "image" && (
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
                            {item.playable && (
                              <FeedVideo
                                key={item.url}
                                index={itemIndex}
                                media={item}
                                platform={platform}
                                postUrl={postUrl}
                                sourceId={sourceId}
                                fullscreen
                                onFullscreen={() => router.back()}
                                navigationGestures={navigationGestures}
                              />
                            )}
                            {!item.playable && (
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
                                  color="white"
                                  style={{
                                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                                    padding: 16,
                                  }}
                                >
                                  {t("mediaOpenOriginal")}
                                </Typography>
                              </Pressable>
                            )}
                          </SafeAreaView>
                        )}
                      </View>
                    )}
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
              {canDownloadMedia(selectedMedia, platform) && (
                <MediaDownloadButton media={selectedMedia} />
              )}
            </View>
            <IconButton
              accessibilityLabel={t("mediaCloseFullscreen")}
              onPress={() => router.back()}
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                borderColor: "rgba(255, 255, 255, 0.3)",
              }}
            >
              <Icon name={IconName.X} color="white" size={24} />
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
              color="white"
              style={{
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
