// App interface language. Strings are written in English in the code and wrapped in t(); the
// Chinese versions live in zh.ts, keyed by the English text. A unit test checks that every t()
// string in the code has a Chinese translation (see CLAUDE.md).
//
// Use {name} placeholders for values: t('{n} left', { n: 3 }).

import { useSyncExternalStore } from 'react';
import { subscribe, getState } from '../lib/store';
import zh from './zh';

export type UiLang = 'en' | 'zh';

let signedOutLang: UiLang = typeof navigator !== 'undefined' && /^zh/i.test(navigator.language) ? 'zh' : 'en';

/** The interface language: the user's choice, or Chinese when learning English, or English. */
export function currentUiLang(): UiLang {
  const s = getState();
  if (!s.userId) return signedOutLang;
  if (s.settings.uiLang === 'zh' || s.settings.uiLang === 'en') return s.settings.uiLang;
  return s.settings.learning === 'en' ? 'zh' : 'en';
}

/** For the login screen, before there are settings. */
export function setSignedOutLang(lang: UiLang) {
  signedOutLang = lang;
}

function format(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}

/** Translates outside React (errors, notifications). */
export function t(key: string, params?: Record<string, string | number>): string {
  const lang = currentUiLang();
  return format(lang === 'zh' ? (zh[key] ?? key) : key, params);
}

/** Re-renders when the interface language changes. */
export function useUiLang(): UiLang {
  return useSyncExternalStore(subscribe, currentUiLang);
}

export function useT() {
  useUiLang();
  return t;
}

/** "Chinese" or "English" in the interface language. */
export const langName = (lang: 'zh' | 'en') => t(lang === 'zh' ? 'Chinese' : 'English');

/** Placeholders for game texts: {target} = language being learned, {native} = the other one. */
export const langParams = (lang: 'zh' | 'en') => ({ target: langName(lang), native: langName(lang === 'zh' ? 'en' : 'zh') });

/** "Level 13" in the interface language. */
export const levelName = (n: number) => t('Level {n}', { n });
