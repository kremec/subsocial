import { getLocales } from "expo-localization";

import { I18n, type TranslateOptions } from "i18n-js";

import en from "@/translation/locales/en.json";

const i18n = new I18n(
  { en },
  {
    locale: getLocales()[0].languageTag,
    defaultLocale: "en",
    enableFallback: true,
  },
);

export const t = (key: keyof typeof en, options?: TranslateOptions) =>
  i18n.t(key, options);
