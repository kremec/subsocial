import { getLocales } from "expo-localization";

import {
  I18n,
  useMakePlural as createPluralizer,
  type TranslateOptions,
} from "i18n-js";
import * as plurals from "make-plural";

import type { TranslationKeys } from "@/translation/translation-keys";

type Catalog = Partial<
  Record<TranslationKeys, string | Record<string, string> | null>
>;
const pluralizers: Partial<
  Record<string, Parameters<typeof createPluralizer>[0]["pluralizer"]>
> = plurals;

const files = require.context("./locales", false, /\.json$/);
const translations: Record<string, Catalog> = Object.fromEntries(
  files
    .keys()
    .map((file) => [
      Intl.getCanonicalLocales(file.slice(2, -5))[0],
      files<Catalog>(file),
    ]),
);
const preferredLocales = getLocales().flatMap((device) => {
  const parts = Intl.getCanonicalLocales(device.languageTag)[0].split("-");
  return parts.map((_, index) =>
    parts.slice(0, parts.length - index).join("-"),
  );
});
export const locale =
  preferredLocales.find((name) => Object.hasOwn(translations, name)) ?? "en";

const i18n = new I18n(translations, { locale, enableFallback: true });

for (const name of Object.keys(translations)) {
  const pluralizer =
    pluralizers[name.replaceAll("-", "_")] ??
    pluralizers[name.split("-")[0]] ??
    plurals.en;
  i18n.pluralization.register(name, createPluralizer({ pluralizer }));
}

export function t(key: TranslationKeys, options?: TranslateOptions): string {
  const sourceLocale = i18n.locales
    .get(options?.locale ?? locale)
    .find((name) => {
      const value = translations[name]?.[key];
      if (typeof value === "object" && value !== null && options?.count != null)
        return i18n.pluralization
          .get(name)(i18n, options.count)
          .some((category) => value[category] != null);
      return value != null;
    });
  return i18n.t(key, { ...options, locale: sourceLocale });
}
