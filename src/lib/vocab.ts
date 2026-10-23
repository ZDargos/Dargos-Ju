// Vocabulary study: the words (and, when learning Chinese, the single characters) used in each
// level's sentences, taken from the same word splits the sentences use. Several levels share one
// list without duplicates. Pronunciation and meaning come from the built-in dictionaries
// (CC-CEDICT for Chinese, ECDICT for English), the same ones the tap-a-word panel uses.
//
// Word cards are scheduled like sentence cards; their ids are "w:<word>" (card keys "w:我|r", and
// "en:w:go|r" in English mode), so they never collide with sentence ids.

import { isHanWord } from './segmenter';
import { isEnglishWord } from './english';
import type { Content } from './content';
import type { LearnLang } from './learn';
import type { Sentence } from '../types';

export type WordKind = 'words' | 'chars' | 'both';

export interface VocabItem {
  /** Study id: "w:" + text. */
  id: string;
  text: string;
  lang: LearnLang;
  /** Lowest selected level whose sentences use it (new cards are introduced level by level). */
  level: number;
  /** Pinyin or IPA. */
  py: string;
  /** Short meaning in the learner's own language. */
  gloss: string;
  /** Used as a word on its own in some sentence. */
  isWord: boolean;
  /** A single character (Chinese only). */
  isChar: boolean;
  /** A sentence that uses it, for context. */
  exampleId?: string;
}

export const WORD_PREFIX = 'w:';
export const isWordId = (sid: string) => sid.startsWith(WORD_PREFIX);

const cache = new WeakMap<Content, Map<string, VocabItem[]>>();

/** Every vocabulary item per level for a language (cached per content version). */
function allItems(content: Content, lang: LearnLang): VocabItem[] {
  let byLang = cache.get(content);
  if (!byLang) cache.set(content, (byLang = new Map()));
  const hit = byLang.get(lang);
  if (hit) return hit;
  const items = new Map<string, VocabItem>();
  const add = (text: string, level: number, isWord: boolean, s: Sentence, py: string, gloss: string) => {
    const id = WORD_PREFIX + text;
    const cur = items.get(id);
    if (cur) {
      items.set(id, { ...cur, isWord: cur.isWord || isWord, ...(level < cur.level ? { level, exampleId: s.id } : {}) });
      return;
    }
    items.set(id, { id, text, lang, level, py, gloss, isWord, isChar: lang === 'zh' && [...text].length === 1, exampleId: s.id });
  };
  for (const s of content.sentences) {
    if (lang === 'zh') {
      for (const w of s.tokens.filter(isHanWord)) {
        const e = content.lexicon[w];
        if (e) add(w, s.level, true, s, e.py, e.en);
        if ([...w].length > 1)
          for (const c of new Set(w)) {
            const ce = content.lexicon[c];
            if (ce) add(c, s.level, false, s, ce.py, ce.en);
          }
      }
    } else {
      for (const tok of s.enTokens) {
        // Names stay out of the vocabulary; "I" is a word like any other.
        if (!isEnglishWord(tok) || (content.enProper.has(tok) && tok !== 'I') || /^[A-Z]{2,}$/.test(tok)) continue;
        const w = tok.toLowerCase();
        const lemma = content.enLemma[w] ?? w;
        const e = content.enLexicon[lemma] ?? content.enLexicon[w];
        if (e && e.en) add(lemma, s.level, true, s, e.py, e.en);
      }
    }
  }
  const list = [...items.values()];
  byLang.set(lang, list);
  return list;
}

/** The vocabulary for the selected levels, without duplicates. Characters exist only in Chinese mode. */
export function vocabFor(content: Content, lang: LearnLang, levels: number[], kind: WordKind = 'both'): VocabItem[] {
  const set = new Set(levels);
  // Which selected level uses each item first, and whether it's used as a word there or only
  // inside longer words (a character).
  const firstLevel = new Map<string, number>();
  const asWord = new Set<string>();
  const note = (text: string, level: number, word: boolean) => {
    const id = WORD_PREFIX + text;
    if (!firstLevel.has(id) || level < firstLevel.get(id)!) firstLevel.set(id, level);
    if (word) asWord.add(id);
  };
  for (const s of content.sentences) {
    if (!set.has(s.level)) continue;
    if (lang === 'zh') {
      for (const w of s.tokens.filter(isHanWord)) {
        note(w, s.level, true);
        if ([...w].length > 1) for (const c of w) note(c, s.level, false);
      }
    } else for (const tok of s.enTokens.filter(isEnglishWord)) note(content.enLemma[tok.toLowerCase()] ?? tok.toLowerCase(), s.level, true);
  }
  return allItems(content, lang)
    .filter((v) => firstLevel.has(v.id))
    .filter((v) => lang === 'en' || kind === 'both' || (kind === 'chars' ? v.isChar : asWord.has(v.id)))
    .map((v) => ({ ...v, level: firstLevel.get(v.id)!, isWord: asWord.has(v.id) }));
}

/** Looks up one vocabulary item by its study id. */
export function vocabItem(content: Content, lang: LearnLang, id: string): VocabItem | undefined {
  return allItems(content, lang).find((v) => v.id === id);
}
