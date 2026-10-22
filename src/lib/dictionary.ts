// Full dictionary entries for every word in the built-in sentences, generated at build time
// (scripts/build-sentences.ts) and loaded on first use as separate files:
// CC-CEDICT for Chinese words, ECDICT (English → Chinese) for English words.

import type { FullEntry } from './segmenter';
import type { EnFullEntry } from './englishDict';

let zhCache: Promise<Record<string, FullEntry[]>> | null = null;
let enCache: Promise<Record<string, EnFullEntry>> | null = null;

export function loadDictionary(): Promise<Record<string, FullEntry[]>> {
  zhCache ??= import('../generated/dictionary.json').then((m) => m.default as Record<string, FullEntry[]>);
  zhCache.catch(() => (zhCache = null));
  return zhCache;
}

export function loadEnglishDictionary(): Promise<Record<string, EnFullEntry>> {
  enCache ??= import('../generated/en-dictionary.json').then((m) => m.default as unknown as Record<string, EnFullEntry>);
  enCache.catch(() => (enCache = null));
  return enCache;
}
