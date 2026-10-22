// Full CC-CEDICT entries for every word and character in the built-in sentences, generated at
// build time (scripts/build-sentences.ts) and loaded on first use as a separate file.

import type { FullEntry } from './segmenter';

let cache: Promise<Record<string, FullEntry[]>> | null = null;

export function loadDictionary(): Promise<Record<string, FullEntry[]>> {
  cache ??= import('../generated/dictionary.json').then((m) => m.default as Record<string, FullEntry[]>);
  cache.catch(() => (cache = null));
  return cache;
}
