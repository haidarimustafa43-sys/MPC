import type { Language } from "../domain/common";

/*
 * localStorage holds only small UI preferences. Access is wrapped because it
 * throws in some private-browsing modes; the app must work without it.
 */

const KEYS = { language: "mpc.language", activeGameId: "mpc.activeGameId", showTips: "mpc.showTips" } as const;

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null): void => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Preferences are optional; ignore storage failures.
  }
};

export const getStoredLanguage = (): Language => (read(KEYS.language) === "sv" ? "sv" : "en");
export const setStoredLanguage = (language: Language): void => write(KEYS.language, language);
/** Tips are on unless the student turned them off. */
export const getStoredShowTips = (): boolean => read(KEYS.showTips) !== "false";
export const setStoredShowTips = (show: boolean): void => write(KEYS.showTips, show ? null : "false");
export const getActiveGameId = (): string | null => read(KEYS.activeGameId);
export const setActiveGameId = (id: string | null): void => write(KEYS.activeGameId, id);
