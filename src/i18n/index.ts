import type { Language, LocalizedText } from "../domain/common";
import type { TranslationKey } from "./en";
import { en } from "./en";
import { sv } from "./sv";

export type { TranslationKey };

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, sv };

export type Params = Record<string, string | number>;

const interpolate = (template: string, params?: Params): string =>
  params ? template.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match)) : template;

export const isTranslationKey = (key: string): key is TranslationKey => key in en;

/** Translates a key; unknown keys fall back to the key itself so missing texts are visible. */
export const translate = (language: Language, key: string, params?: Params): string => {
  if (!isTranslationKey(key)) return interpolate(key, params);
  return interpolate(dictionaries[language][key] ?? en[key], params);
};

export const localize = (text: LocalizedText, language: Language): string =>
  (language === "sv" ? text.sv : undefined) ?? text.en;
