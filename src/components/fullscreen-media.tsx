import { type FC, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  View,
  type ScrollViewInstance,
} from "react-native";

import { Image } from "expo-image";
import { useNavigation } from "expo-router";

import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon, IconName } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { canDownloadMedia } from "@/hooks/use-media-download";
import { openPost } from "@/platforms/open-post";
import { FeedVideo } from "@/screens/feed/components/feed-video";
import { FullscreenImage } from "@/screens/feed/components/fullscreen-image";
import { MediaDownloadButton } from "@/screens/feed/components/media-download-button";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";
import { type FeedMedia, FeedMediaType } from "@/types/feed-media";
import { type PlatformId } from "@/types/platform-id";

interface FullscreenMediaProps {
  media: FeedMedia[];
  postUrl: string;
  platform: PlatformId;
  androidUrl?: string;
  sourceId?: string;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

export type MediaAlbum = Omit<FullscreenMediaProps, "onClose">;

export const FullscreenMedia: FC<FullscreenMediaProps> = (props) => {
  const {
    media,
    postUrl,
    platform,
    androidUrl,
    sourceId,
    index: mediaIndex,
    onIndexChange,
    onClose,
  } = props;
  const navigation = useNavigation();
  const { colors } = useTheme();
  useEffect(() => {
    navigation.setOptions({ orientation: "default" });
    return () =>
      navigation.setOptions({
        orientation: "portrait",
      });
  }, [navigation]);
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
      if (event.translationY > 80) onClose();
    });

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={[
        "portrait",
        "portrait-upside-down",
        "landscape-left",
        "landscape-right",
      ]}
    >
      <StatusBar hidden />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <GestureDetector gesture={closeGesture}>
          <View
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
            style={{ flex: 1, backgroundColor: colors.mediaBackground }}
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
                    onIndexChange(selectedIndex);
                  }}
                  style={{ flex: 1 }}
                >
                  {media.map((item, itemIndex) => (
                    <View
                      key={`${item.url}:${itemIndex}`}
                      style={{ width, height: "100%" }}
                    >
                      {Math.abs(itemIndex - mediaIndex) <= 1 &&
                        item.type === FeedMediaType.IMAGE && (
                          <FullscreenImage
                            uri={item.url}
                            aspectRatio={item.aspectRatio}
                            onZoomChange={
                              itemIndex === mediaIndex ? setZoomed : undefined
                            }
                          />
                        )}
                      {Math.abs(itemIndex - mediaIndex) <= 1 &&
                        item.type !== FeedMediaType.IMAGE && (
                          <View style={{ flex: 1 }}>
                            {!!item.posterUrl && (
                              <Image
                                source={{ uri: item.posterUrl }}
                                contentFit="contain"
                                style={{ position: "absolute", inset: 0 }}
                              />
                            )}
                            {itemIndex === mediaIndex && (
                              <SafeAreaView style={{ flex: 1 }}>
                                {item.playable && (
                                  <FeedVideo
                                    navigationGestures={[
                                      pagingGesture,
                                      closeGesture,
                                    ]}
                                    key={item.url}
                                    index={itemIndex}
                                    media={item}
                                    platform={platform}
                                    postUrl={postUrl}
                                    sourceId={sourceId}
                                  />
                                )}
                                {!item.playable && (
                                  <Pressable
                                    accessibilityRole="button"
                                    onPress={() =>
                                      void openPost(
                                        platform,
                                        postUrl,
                                        androidUrl,
                                      )
                                    }
                                    style={{
                                      flex: 1,
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    <Typography
                                      color={colors.mediaForeground}
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
              style={{
                position: "absolute",
                inset: 0,
                padding: 16,
                flexDirection: "row",
                alignItems: "flex-start",
              }}
            >
              {selectedMedia.type === FeedMediaType.IMAGE &&
                canDownloadMedia(selectedMedia, platform) && (
                  <MediaDownloadButton media={selectedMedia} />
                )}
              <IconButton
                accessibilityLabel={t("mediaCloseFullscreen")}
                onPress={onClose}
                style={{
                  marginLeft: "auto",
                  backgroundColor: "rgba(0, 0, 0, 0.5)",
                  borderColor: "rgba(255, 255, 255, 0.3)",
                }}
              >
                <Icon
                  name={IconName.X}
                  color={colors.mediaForeground}
                  size={24}
                />
              </IconButton>
            </SafeAreaView>
            {media.length > 1 && (
              <SafeAreaView
                pointerEvents="none"
                style={{ position: "absolute", top: 16, alignSelf: "center" }}
              >
                <Typography
                  variant="caption"
                  color={colors.mediaForeground}
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
      </GestureHandlerRootView>
    </Modal>
  );
};
