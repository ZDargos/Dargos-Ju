// The learning language ('zh' = learning Chinese, 'en' = learning English) and everything that
// differs between the two modes. Every feature that shows or checks the language being learned
// goes through here, so both modes keep working (see CLAUDE.md).
//
// A LearnSentence is a sentence seen from the learner's side: `target` is the language being
// learned and `native` is the other one. Cards, games and stats work on LearnSentences, so the
// same code serves both modes.

import { createContext, useContext } from 'react';
import { isHanWord, isPunctuation } from './segmenter';
import { isEnglishTile, isEnglishWord, joinEnglish, normalizeEnglish, tileText } from './english';
import type { Content } from './content';
import type { LexEntry, Sentence } from '../types';

export type LearnLang = 'zh' | 'en';

export interface LearnSentence {
  id: string;
  level: number;
  lang: LearnLang;
  /** The sentence in the language being learned. */
  target: string;
  /** The same sentence in the learner's own language. */
  native: string;
  /** Tokens of `target`, including punctuation. */
  tokens: string[];
  source: Sentence;
}

/** A dialogue speaker label like "A:" (one token after project()): never a word, tile or game piece. */
export const isLabel = (t: string) => /^[A-Z][:：]$/.test(t);

const ENDS_LINE = /[.!?。！？…"”]$/;

/** Joins "A" + ":" at the start of a line of dialogue into one label token. */
export function mergeLabels(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const next = tokens[i + 1];
    if (/^[A-Z]$/.test(tok) && (next === ':' || next === '：') && (i === 0 || ENDS_LINE.test(tokens[i - 1]))) {
      out.push(tok + next);
      i++;
    } else out.push(tok);
  }
  return out;
}

/** Removes dialogue labels from text, so answers are compared without them. */
const stripLabels = (s: string) => s.replace(/(^|[.!?。！？…"”]\s*)[A-Z]\s*[:：]/g, '$1');

export function project(s: Sentence, lang: LearnLang): LearnSentence {
  return lang === 'en'
    ? { id: s.id, level: s.level, lang, target: s.enClean, native: s.zh, tokens: mergeLabels(s.enTokens), source: s }
    : { id: s.id, level: s.level, lang, target: s.zh, native: s.en, tokens: mergeLabels(s.tokens), source: s };
}

export interface LangOps {
  lang: LearnLang;
  /** A vocabulary word that is tracked for difficulty and can be swapped in games. */
  isWord: (t: string) => boolean;
  /** Anything a player moves around in tile games (everything except punctuation). */
  isTile: (t: string) => boolean;
  /** For comparing answers: ignores spacing and punctuation (and case/contractions in English). */
  normalize: (s: string) => string;
  /** Puts tokens back into readable text. */
  join: (tokens: string[]) => string;
  /** Word groups learners mix up, for Spot the error and Close call. */
  confusables: string[][];
  /** Small words that are easy to add or drop by mistake. */
  particles: string[];
  /** BCP 47 language for speech and screen readers. */
  speech: string;
}

const ZH_CONFUSABLE: string[][] = [
  ['了', '过', '着'], ['不', '没'], ['的', '得', '地'], ['在', '再'], ['会', '能', '可以'], ['吗', '呢', '吧'],
  ['很', '太', '真'], ['又', '再', '还'], ['也', '都'], ['就', '才'], ['和', '跟'], ['想', '要'], ['去', '来'],
  ['上', '下'], ['前', '后'], ['多', '少'], ['大', '小'], ['这', '那'], ['他', '她'],
  ['个', '只', '张', '本', '把', '块', '杯', '台', '件'], ['我', '你'], ['有', '是'], ['往', '从', '向'],
  ['一点', '有点'], ['以上', '以下', '以内'], ['回来', '回去'], ['上来', '下来', '上去', '下去'],
  ['今天', '明天', '昨天'], ['早上', '下午', '晚上'], ['东边', '西边'], ['认为', '以为'], ['可是', '但是'],
  ['最', '更'], ['这儿', '那儿', '哪儿'], ['这个', '那个', '哪个'], ['什么', '怎么'], ['几', '多少'],
  ['还是', '或者'], ['看', '见', '听'], ['说', '讲', '告诉'], ['知道', '认识'],
];

// Mistakes Chinese speakers commonly make in English.
const EN_CONFUSABLE: string[][] = [
  ['a', 'an', 'the'], ['in', 'on', 'at'], ['to', 'for', 'at'], ['of', 'for', 'from'], ['is', 'are', 'am'],
  ['was', 'were'], ['do', 'does', 'did'], ['have', 'has', 'had'], ['he', 'she', 'it'], ['him', 'her'],
  ['his', 'her', 'its'], ['they', 'them', 'their'], ['i', 'me', 'my'], ['we', 'us', 'our'],
  ['this', 'that', 'these', 'those'], ['much', 'many'], ['few', 'little'], ['some', 'any'],
  ['go', 'goes', 'went', 'gone'], ['come', 'comes', 'came'], ['eat', 'eats', 'ate', 'eaten'],
  ['see', 'saw', 'seen'], ['say', 'said', 'tell', 'told'], ['speak', 'talk', 'say'], ['look', 'see', 'watch'],
  ['bring', 'take'], ['borrow', 'lend'], ['very', 'too', 'so'], ['also', 'too', 'either'], ['still', 'yet', 'already'],
  ['before', 'ago'], ['can', 'could', 'will', 'would'], ['must', 'should'], ['who', 'what', 'which', 'where'],
  ['how', 'why', 'when'], ['big', 'bigger', 'biggest'], ['good', 'well', 'better'], ['bad', 'badly', 'worse'],
  ['fast', 'quickly'], ['slow', 'slowly'], ['up', 'down'], ['into', 'onto'], ['over', 'under'],
  ['son', 'sons'], ['day', 'days'], ['year', 'years'], ['person', 'people'], ['child', 'children'],
];

const zhOps: LangOps = {
  lang: 'zh',
  isWord: isHanWord,
  isTile: (t) => !isPunctuation(t) && !isLabel(t),
  normalize: (s) => stripLabels(s).replace(/[\s\p{P}\p{S}]/gu, ''),
  join: (tokens) => {
    // Spaces only between Latin/number tokens, so "A380" and "OK" stay readable.
    let out = '';
    tokens.forEach((t, i) => {
      if (i > 0 && /[A-Za-z0-9]$/.test(tokens[i - 1]) && /^[A-Za-z0-9]/.test(t)) out += ' ';
      out += t;
    });
    return out;
  },
  confusables: ZH_CONFUSABLE,
  particles: ['了', '的', '很', '都', '也', '在', '不', '着', '过', '吧', '就', '还', '是'],
  speech: 'zh-CN',
};

const enOps: LangOps = {
  lang: 'en',
  isWord: isEnglishWord,
  isTile: isEnglishTile,
  normalize: (s) => normalizeEnglish(stripLabels(s)),
  join: joinEnglish,
  confusables: EN_CONFUSABLE,
  particles: ['the', 'a', 'to', 'is', 'do', 'very', 'also', 'not', 'of', 'will'],
  speech: 'en-US',
};

export const opsFor = (lang: LearnLang): LangOps => (lang === 'en' ? enOps : zhOps);

/** Pronunciation (pinyin or IPA) and short meaning for each word of the language being learned. */
export function lexiconFor(content: Content, lang: LearnLang): Record<string, LexEntry> {
  return lang === 'en' ? content.enLexicon : content.lexicon;
}

/** Looks a token up in a lexicon; English lookups ignore case. */
export function lookup(lexicon: Record<string, LexEntry>, token: string): LexEntry | undefined {
  return lexicon[token] ?? lexicon[token.toLowerCase()];
}

/** The word tiles for a sentence. English tiles start lowercase so the capital doesn't give away the first word. */
export function tilesFor(s: LearnSentence, content: Content): string[] {
  const ops = opsFor(s.lang);
  const tiles = s.tokens.filter(ops.isTile);
  return s.lang === 'en' ? tiles.map((t) => tileText(t, content.enProper)) : tiles;
}

/** The vocabulary words of a sentence (for difficulty tracking): Chinese words, or English dictionary forms. */
export function wordsFor(s: Sentence, lang: LearnLang, content: Content): string[] {
  if (lang === 'zh') return s.tokens.filter(isHanWord);
  return mergeLabels(s.enTokens).filter(isEnglishWord).map((t) => {
    const w = t.toLowerCase();
    return content.enLemma[w] ?? w.replace(/'s$/, '');
  });
}

/** Which language the screen below is working in (game screens and vs matches provide it). */
export const LearnContext = createContext<LearnLang>('zh');
export const useLearnLang = () => useContext(LearnContext);
