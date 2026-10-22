// Progress statistics and word/character difficulty.
//
// All stats are per learning language: callers pass the mode, and logs/cards from the other
// mode are ignored.
//
// Word difficulty comes from the review history: every time a sentence is graded, each word of
// the language being learned (Chinese words, or English dictionary forms) shares the result (Wrong = 1 miss, Mostly right = 0.4, Right = 0). Recent reviews
// count more (30-day half-life), and a Bayesian prior keeps rarely seen words from topping the
// list on one bad answer. Characters roll up from the words they appear in.

import { State } from 'ts-fsrs';
import { cardKey, logLang, parseKey, weakness } from './srs';
import { wordsFor } from './learn';
import type { Content } from './content';
import type { CardRecord, Dir, Grade, LearnLang, ReviewLog, Sentence, Settings } from '../types';

/** Only the logs of one learning language. */
export const logsFor = (logs: ReviewLog[], lang: LearnLang) => logs.filter((l) => logLang(l) === lang);

const DAY = 86_400_000;
const MISS: Record<Grade, number> = { 1: 1, 2: 0.4, 3: 0 };
const HALF_LIFE_DAYS = 30;
const PRIOR_WEIGHT = 2;
export const MATURE_DAYS = 21;

export type Bucket = 'new' | 'learning' | 'young' | 'mature';

export function bucketOf(rec: CardRecord | undefined): Bucket {
  if (!rec || rec.card.state === State.New) return 'new';
  if (rec.card.state === State.Learning || rec.card.state === State.Relearning) return 'learning';
  return rec.card.stability >= MATURE_DAYS ? 'mature' : 'young';
}

export interface LevelProgress {
  level: number;
  name: string;
  total: number;
  counts: Record<Dir, Record<Bucket, number>>;
}

const emptyBuckets = (): Record<Bucket, number> => ({ new: 0, learning: 0, young: 0, mature: 0 });

export function levelProgress(content: Content, cards: Record<string, CardRecord>, lang: LearnLang): LevelProgress[] {
  const map = new Map<number, LevelProgress>();
  for (const l of content.levels) map.set(l.level, { level: l.level, name: l.name, total: 0, counts: { r: emptyBuckets(), p: emptyBuckets() } });
  for (const s of content.sentences) {
    const lp = map.get(s.level)!;
    lp.total++;
    for (const dir of ['r', 'p'] as Dir[]) lp.counts[dir][bucketOf(cards[cardKey(s.id, dir, lang)])]++;
  }
  return [...map.values()];
}

export interface DayActivity {
  date: string; // YYYY-MM-DD local
  reviews: number;
  passed: number;
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function activity(logs: ReviewLog[], days: number): DayActivity[] {
  const out: DayActivity[] = [];
  const index = new Map<string, DayActivity>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY);
    const a = { date: localDay(d), reviews: 0, passed: 0 };
    out.push(a);
    index.set(a.date, a);
  }
  for (const l of logs) {
    const a = index.get(localDay(new Date(l.at)));
    if (!a) continue;
    a.reviews++;
    if (l.grade >= 2) a.passed++;
  }
  return out;
}

export function streak(logs: ReviewLog[]): number {
  const days = new Set(logs.map((l) => localDay(new Date(l.at))));
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (!days.has(localDay(d))) d.setTime(d.getTime() - DAY); // today not done yet doesn't break it
  let n = 0;
  while (days.has(localDay(d))) {
    n++;
    d.setTime(d.getTime() - DAY);
  }
  return n;
}

/** Share of scheduled reviews (not new cards) answered Right or Mostly right in the window. */
export function retentionRate(logs: ReviewLog[], days = 30): { rate: number | null; n: number } {
  const since = Date.now() - days * DAY;
  const reviews = logs.filter((l) => l.mode === 'review' && Date.parse(l.at) >= since);
  if (!reviews.length) return { rate: null, n: 0 };
  return { rate: reviews.filter((l) => l.grade >= 2).length / reviews.length, n: reviews.length };
}

export function dueForecast(content: Content, cards: Record<string, CardRecord>, lang: LearnLang, days = 7): number[] {
  const out = new Array(days).fill(0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const ids = new Set(content.sentences.map((s) => s.id));
  for (const [key, rec] of Object.entries(cards)) {
    const k = parseKey(key);
    if (rec.card.state === State.New || k.lang !== lang || !ids.has(k.sid)) continue;
    const due = Date.parse(rec.card.due);
    const idx = due <= end.getTime() ? 0 : Math.ceil((due - end.getTime()) / DAY);
    if (idx < days) out[idx]++;
  }
  return out;
}

export interface HardSentence {
  sentence: Sentence;
  dir: Dir;
  score: number;
  misses: number;
  reps: number;
}

export function hardestSentences(content: Content, cards: Record<string, CardRecord>, logs: ReviewLog[], settings: Settings, dir: Dir, lang: LearnLang, limit = 10): HardSentence[] {
  const misses = new Map<string, number>();
  for (const l of logs) if (l.dir === dir && l.grade === 1 && logLang(l) === lang) misses.set(l.sid, (misses.get(l.sid) ?? 0) + 1);
  const out: HardSentence[] = [];
  for (const s of content.sentences) {
    const rec = cards[cardKey(s.id, dir, lang)];
    if (!rec || rec.card.state === State.New || rec.card.reps < 2) continue;
    out.push({ sentence: s, dir, score: weakness(rec, settings), misses: misses.get(s.id) ?? 0, reps: rec.card.reps });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface TermStat {
  term: string;
  /** Smoothed miss rate 0..1. */
  score: number;
  /** Number of graded sentences the term appeared in. */
  seen: number;
  missRaw: number;
}

export interface TermDifficulty {
  words: Record<Dir, TermStat[]>;
  chars: Record<Dir, TermStat[]>;
}

/** Characters are only tracked when learning Chinese. */
export function termDifficulty(content: Content, logs: ReviewLog[], lang: LearnLang): TermDifficulty {
  const now = Date.now();
  type Acc = { w: number; miss: number; n: number; rawMiss: number };
  const acc = {
    words: { r: new Map<string, Acc>(), p: new Map<string, Acc>() },
    chars: { r: new Map<string, Acc>(), p: new Map<string, Acc>() },
  };
  const totals = { r: { w: 0, miss: 0 }, p: { w: 0, miss: 0 } };
  const termsCache = new Map<string, { words: string[]; chars: string[] }>();
  const termsOf = (s: Sentence) => {
    let t = termsCache.get(s.id);
    if (!t) {
      const words = [...new Set(wordsFor(s, lang, content))];
      const chars = lang === 'zh' ? [...new Set(words.join(''))] : [];
      t = { words, chars };
      termsCache.set(s.id, t);
    }
    return t;
  };
  const add = (m: Map<string, Acc>, k: string, w: number, miss: number) => {
    const a = m.get(k) ?? { w: 0, miss: 0, n: 0, rawMiss: 0 };
    a.w += w;
    a.miss += w * miss;
    a.n++;
    a.rawMiss += miss;
    m.set(k, a);
  };

  for (const l of logs) {
    const s = content.byId.get(l.sid);
    if (!s || logLang(l) !== lang) continue;
    const decay = Math.pow(0.5, (now - Date.parse(l.at)) / DAY / HALF_LIFE_DAYS);
    const miss = MISS[l.grade];
    totals[l.dir].w += decay;
    totals[l.dir].miss += decay * miss;
    const { words, chars } = termsOf(s);
    for (const w of words) add(acc.words[l.dir], w, decay, miss);
    for (const c of chars) add(acc.chars[l.dir], c, decay, miss);
  }

  const finish = (m: Map<string, Acc>, dir: Dir): TermStat[] => {
    const prior = totals[dir].w > 0 ? totals[dir].miss / totals[dir].w : 0.3;
    return [...m.entries()]
      .map(([term, a]) => ({
        term,
        score: (a.miss + PRIOR_WEIGHT * prior) / (a.w + PRIOR_WEIGHT),
        seen: a.n,
        missRaw: a.rawMiss / a.n,
      }))
      .sort((x, y) => y.score - x.score);
  };
  return {
    words: { r: finish(acc.words.r, 'r'), p: finish(acc.words.p, 'p') },
    chars: { r: finish(acc.chars.r, 'r'), p: finish(acc.chars.p, 'p') },
  };
}

export function overallCounts(content: Content, cards: Record<string, CardRecord>, lang: LearnLang) {
  const counts = { r: emptyBuckets(), p: emptyBuckets() };
  for (const s of content.sentences) for (const dir of ['r', 'p'] as Dir[]) counts[dir][bucketOf(cards[cardKey(s.id, dir, lang)])]++;
  return counts;
}
