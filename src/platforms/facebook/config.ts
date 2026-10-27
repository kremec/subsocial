import { t } from "@/translation/use-translation";
import { type PlatformDefinition } from "@/types/platform-definition";

export const facebookPlatform: PlatformDefinition = {
  id: "facebook",
  androidAppUrl: "fb://feed",
  androidPackage: "com.facebook.katana",
  appScheme: "fb",
  dataDomains: ["facebook.com", "fbcdn.net"],
  label: t("platformFacebook"),
  color: "#1877F2",
  startUrl: "https://www.facebook.com/?filter=all&sk=h_chr",
  loginUrl:
    "https://www.facebook.com/login/?next=https%3A%2F%2Fwww.facebook.com%2F%3Ffilter%3Dall%26sk%3Dh_chr",
  sessionCookieGroups: [["c_user"], ["xs"]],
};

// Required presentation variables from Facebook’s CometModernHomeFeedQuery.
export const facebookFeedPresentationFlags = [
  "GHLShouldChangeAdIdFieldName",
  "GHLShouldChangeSponsoredAuctionDistanceFieldName",
  "GHLShouldUseSponsoredAuctionLabelFieldNameV1",
  "GHLShouldUseSponsoredAuctionLabelFieldNameV2",
  "GHLShouldChangeSponsoredDataFieldName",
  "CometFeedStory_enable_reactor_facepile",
  "CometFeedStory_enable_social_bubbles",
  "CometFeedStory_enable_post_permalink_white_space_click",
  "CometUFICommentActionLinksRewriteEnabled",
  "CometUFICommentAvatarStickerAnimatedImage",
  "IsWorkUser",
  "TestPilotShouldIncludeDemoAdUseCase",
  "FBReels_deprecate_short_form_video_context_gk",
  "FBReels_enable_view_dubbed_audio_type_gk",
  "CometFeedShareMedia_shouldPrefetchShareImage",
  "CometImmersivePhotoCanUserDisable3DMotion",
  "WorkCometIsEmployeeGKProvider",
  "IsMergQAPolls",
  "FBReelsMediaFooter_comet_enable_reels_ads_gk",
  "CometUFIReactionsEnableShortName",
  "CometUFIShareActionMigration",
  "CometUFISingleLineUFI",
  "relay_provider_comet_ufi_ssr_seo_defer",
  "CometUFI_dedicated_comment_routable_dialog_gk",
  "ReelsIFUCard_reelsIFULikeCount",
  "FBReelsIFUTileContent_reelsIFUPlayOnHover",
  "StoriesShouldEnablePhotosensitiveContentWarning",
  "ShouldEnableBakedInTextStories",
  "StoriesShouldIncludeFbNotes",
];
