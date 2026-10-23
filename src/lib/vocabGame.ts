// Shared logic for the vocabulary games (Speed round, Reverse speed round and the word duel):
// seeded word sequences (so both players in a match draw the same way), multiple-choice questions,
// and answer checking. Uses words and characters together, multi-character words included.

import { normalizeEnglish } from './english';
import { pinyinLettersMatch } from './pinyin';
import type { LearnLang } from './learn';
import { glossOf, type VocabItem } from './vocab';

/** Small seeded random generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** A dictionary gloss cut down to its first one or two meanings, for quick reading. */
export function shortGloss(gloss: string): string {
  const parts = gloss
    .replace(/\((?:bound form|coll\.|lit\.|fig\.|literary|dialect|old)\)\s*/gi, '')
    .split(/[;；]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out = parts.slice(0, 2).join('; ');
  return out.length > 48 ? parts[0].slice(0, 48) : out;
}

/** The pool in a stable order, so the same seed gives the same sequence on every device. */
const stable = (pool: VocabItem[]) => [...pool].sort((a, b) => a.id.localeCompare(b.id));

/** An endless shuffled sequence of words from a seed: every word once before any repeats. */
export function wordSequence(pool: VocabItem[], seed: number) {
  const base = stable(pool);
  const random = rng(seed);
  let order: VocabItem[] = [];
  const out: VocabItem[] = [];
  return (i: number): VocabItem => {
    while (out.length <= i) {
      if (!order.length) {
        order = base.slice();
        for (let k = order.length - 1; k > 0; k--) {
          const j = Math.floor(random() * (k + 1));
          [order[k], order[j]] = [order[j], order[k]];
        }
      }
      out.push(order.pop()!);
    }
    return out[i];
  };
}

export interface ChoiceQuestion {
  item: VocabItem;
  /** Four options; one is the item itself. */
  options: VocabItem[];
}

/**
 * The i-th question from a seed. Wrong options come from the same pool, never share the right
 * answer's meaning or text, and in Chinese prefer words of the same length so the answer doesn't
 * stand out.
 */
/** What Speed round answers are: meanings, or the sound (pinyin when learning Chinese, phonetics when learning English). */
export type SpeedAnswer = 'meaning' | 'sound';

/** The text shown for an item as an answer or prompt. */
export const answerText = (v: VocabItem, answer: SpeedAnswer) => (answer === 'sound' ? v.py.trim() : glossOf(v));

/** Items usable for the answer type (every item has a meaning; a few English words lack phonetics). */
export const usableFor = (pool: VocabItem[], answer: SpeedAnswer) => (answer === 'sound' ? pool.filter((v) => v.py.trim()) : pool);

export function choiceQuestions(pool: VocabItem[], seed: number, answer: SpeedAnswer = 'meaning') {
  pool = usableFor(pool, answer);
  const seq = wordSequence(pool, seed);
  const base = stable(pool);
  return (i: number): ChoiceQuestion => {
    const item = seq(i);
    const random = rng(seed ^ ((i + 1) * 2654435761));
    // Never two options that read the same (same meaning, or homophones in pinyin mode).
    const key = (v: VocabItem) => answerText(v, answer).toLowerCase();
    const same = (v: VocabItem) => v.id === item.id || key(v) === key(item) || v.text.toLowerCase() === item.text.toLowerCase();
    const len = [...item.text].length;
    const close = base.filter((v) => !same(v) && Math.abs([...v.text].length - len) <= (item.lang === 'zh' ? 0 : 3));
    const pickFrom = close.length >= 3 ? close : base.filter((v) => !same(v));
    const wrong: VocabItem[] = [];
    while (wrong.length < 3 && wrong.length < pickFrom.length) {
      const v = pickFrom[Math.floor(random() * pickFrom.length)];
      if (!wrong.some((w) => w.id === v.id || key(w) === key(v))) wrong.push(v);
    }
    const options = [item, ...wrong];
    for (let k = options.length - 1; k > 0; k--) {
      const j = Math.floor(random() * (k + 1));
      [options[k], options[j]] = [options[j], options[k]];
    }
    return { item, options };
  };
}

/**
 * Duel answers: pinyin in Chinese mode (tones optional; numbers, marks, spaces and v for ü all
 * fine), the English spelling in English mode (case and punctuation don't matter).
 */
export function duelAnswerOk(typed: string, item: VocabItem, lang: LearnLang): boolean {
  if (!typed.trim()) return false;
  // Any reading counts: 胖 is pàng or pán.
  if (lang === 'zh') return [item.py, ...(item.pys ?? [])].some((py) => pinyinLettersMatch(typed, py));
  return normalizeEnglish(typed).replace(/\s+/g, '') === normalizeEnglish(item.text).replace(/\s+/g, '');
}

/** Duel difficulty: where the clock starts and its minimum (same as private.duel_seconds on the server). */
export type DuelLevel = 'easy' | 'medium' | 'hard';
export const DUEL_LEVELS: Record<DuelLevel, { start: number; min: number }> = {
  easy: { start: 25, min: 10 },
  medium: { start: 20, min: 6 },
  hard: { start: 15, min: 6 },
};
/** Right answers it takes for the clock to reach its minimum. */
const DUEL_STEPS = 12;
export const asDuelLevel = (v: string | null | undefined): DuelLevel => (v === 'easy' || v === 'medium' ? v : 'hard');

/** Seconds for a move: starts at the level's start and shrinks with every right answer down to its minimum. */
export function duelSeconds(correct: number, level: DuelLevel = 'hard'): number {
  const { start, min } = DUEL_LEVELS[level];
  return Math.max(min, start - ((start - min) / DUEL_STEPS) * correct);
}

/** A wrong guess takes this share of the move's time off the clock (the player keeps trying). */
export const WRONG_GUESS_PENALTY = 0.2;

/** All accepted readings of a word, for showing the answer. */
export const readingsOf = (item: VocabItem) => [...new Set([item.py, ...(item.pys ?? [])])].join(' / ');
export const DUEL_LIVES = 4;
/** 0..1, how heated the duel is: drives the shaking, pulsing and colour. */
export const duelIntensity = (correct: number) => Math.min(1, correct / 12);
