// Word segmentation in the browser, for sentences added from the admin page. Loads jieba (WASM)
// and the compact CC-CEDICT word list on first use, so regular users never download them.

import { segment } from './segmenter';
import type { LexEntry } from '../types';

export interface BrowserSegmenter {
  segment(zh: string): string[];
  /** Pinyin and gloss for each word and character in the tokens. */
  lexFor(tokens: string[]): Record<string, LexEntry>;
}

let loading: Promise<BrowserSegmenter> | null = null;

export function loadSegmenter(): Promise<BrowserSegmenter> {
  loading ??= (async () => {
    const [jieba, dictRes] = await Promise.all([import('jieba-wasm/web'), fetch('./dict/cedict-lite.json')]);
    await jieba.default();
    if (!dictRes.ok) throw new Error('Could not load the dictionary');
    const dict = (await dictRes.json()) as Record<string, [string, string]>;
    const words = { has: (w: string) => Object.prototype.hasOwnProperty.call(dict, w) };
    return {
      segment: (zh) => segment(zh, words, (t) => jieba.cut(t, true)),
      lexFor: (tokens) => {
        const out: Record<string, LexEntry> = {};
        for (const t of tokens) {
          for (const key of new Set([t, ...Array.from(t)])) {
            const e = words.has(key) ? dict[key] : undefined;
            if (e) out[key] = { py: e[0], en: e[1] };
          }
        }
        return out;
      },
    };
  })();
  loading.catch(() => (loading = null));
  return loading;
}

let englishLite: Promise<Record<string, [string, string, string]>> | null = null;

/**
 * Phonetics and short Chinese meanings for the English words of sentences added in the admin page
 * (English-learning mode). Loads the compact ECDICT list on first use.
 */
export async function englishLexFor(tokens: string[]): Promise<Record<string, LexEntry>> {
  englishLite ??= fetch('./dict/ecdict-lite.json').then((r) => {
    if (!r.ok) throw new Error('Could not load the English dictionary');
    return r.json();
  });
  englishLite.catch(() => (englishLite = null));
  const dict = await englishLite;
  const out: Record<string, LexEntry> = {};
  for (const tok of tokens) {
    const w = tok.toLowerCase();
    const e = dict[w] ?? dict[w.replace(/'s$/, '')];
    if (e) out[w] = { py: e[0], en: e[1] };
  }
  return out;
}
