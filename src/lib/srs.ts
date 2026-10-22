// Spaced repetition with FSRS (ts-fsrs). Each sentence has two cards: reading and producing.
// Sessions shuffle the due cards, add a few new ones, and never include both directions of the
// same sentence. Extra practice samples already-seen cards weighted toward the weakest ones.

import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type FSRS } from 'ts-fsrs';
import { getState, setState } from './store';
import { scheduleSync } from './sync';
import { t } from '../i18n';
import type { Content } from './content';
import type { CardRecord, Dir, Grade, LearnLang, ReviewLog, ReviewMode, Sentence, Settings, StoredCard } from '../types';

/** Card ids: "<sentence>|r" when learning Chinese, "en:<sentence>|r" when learning English. */
export const cardKey = (sid: string, dir: Dir, lang: LearnLang = 'zh') => `${lang === 'en' ? 'en:' : ''}${sid}|${dir}`;
export const parseKey = (key: string) => {
  const lang: LearnLang = key.startsWith('en:') ? 'en' : 'zh';
  const k = lang === 'en' ? key.slice(3) : key;
  const i = k.lastIndexOf('|');
  return { sid: k.slice(0, i), dir: k.slice(i + 1) as Dir, lang };
};

/** Logs from before English mode existed have no lang and are Chinese-learning. */
export const logLang = (l: { lang?: LearnLang }): LearnLang => l.lang ?? 'zh';

let scheduler: { retention: number; f: FSRS } | undefined;
function getScheduler(retention: number): FSRS {
  if (!scheduler || scheduler.retention !== retention) {
    scheduler = {
      retention,
      f: fsrs(
        generatorParameters({
          request_retention: retention,
          enable_fuzz: true,
          enable_short_term: true,
          learning_steps: ['1m', '10m'],
          relearning_steps: ['10m'],
          maximum_interval: 365 * 3,
        }),
      ),
    };
  }
  return scheduler.f;
}

const GRADE_TO_RATING = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good } as const;

function toStored(card: Card): StoredCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

export const isNewCard = (rec: CardRecord | undefined) => !rec || rec.card.state === State.New;

export function retrievability(card: StoredCard, now = new Date(), retention = 0.9): number {
  if (card.state === State.New) return 0;
  return getScheduler(retention).get_retrievability(card, now, false);
}

/** Preview of the next interval for each grade, for the grade buttons. */
export function previewIntervals(sid: string, dir: Dir, settings: Settings, now = new Date()): Record<Grade, string> {
  const rec = getState().cards[cardKey(sid, dir, settings.learning)];
  const card = rec?.card ?? toStored(createEmptyCard(now));
  const preview = getScheduler(settings.retention).repeat(card, now);
  const out = {} as Record<Grade, string>;
  for (const g of [1, 2, 3] as Grade[]) out[g] = formatInterval(preview[GRADE_TO_RATING[g]].card.due.getTime() - now.getTime());
  return out;
}

export function formatInterval(ms: number): string {
  const min = ms / 60000;
  if (min < 60) return t('{n}m', { n: Math.max(1, Math.round(min)) });
  const h = min / 60;
  if (h < 24) return t('{n}h', { n: Math.round(h) });
  const d = h / 24;
  if (d < 30) return t('{n}d', { n: Math.round(d) });
  if (d < 365) return t('{n}mo', { n: Math.round(d / 30) });
  return t('{n}y', { n: (d / 365).toFixed(1) });
}

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/** Records a self-graded answer and reschedules the card. Returns the new due date. */
export function gradeCard(sid: string, dir: Dir, grade: Grade, extra: boolean, lang: LearnLang = getState().settings.learning): Date {
  const now = new Date();
  const s = getState();
  const key = cardKey(sid, dir, lang);
  const prev = s.cards[key];
  const mode: ReviewMode = extra ? 'extra' : isNewCard(prev) ? 'new' : 'review';
  const card = prev?.card ?? toStored(createEmptyCard(now));
  const next = getScheduler(s.settings.retention).next(card, now, GRADE_TO_RATING[grade]).card;
  const log: ReviewLog = { id: uuid(), sid, dir, grade, at: now.toISOString(), mode, lang };
  setState((cur) => ({
    cards: { ...cur.cards, [key]: { card: toStored(next), updatedAt: now.toISOString() } },
    dirtyCards: { ...cur.dirtyCards, [key]: true },
    logs: [...cur.logs, log],
    unsyncedLogs: { ...cur.unsyncedLogs, [log.id]: true },
  }));
  scheduleSync();
  return next.due;
}

// ---------- Session building ----------

export interface SessionItem {
  sid: string;
  dir: Dir;
  kind: 'review' | 'new' | 'extra';
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export function newIntroducedToday(lang: LearnLang = getState().settings.learning): number {
  const since = startOfToday().toISOString();
  return getState().logs.filter((l) => l.mode === 'new' && l.at >= since && logLang(l) === lang).length;
}

function allowedDirs(settings: Settings): Dir[] {
  return settings.directions === 'both' ? ['r', 'p'] : [settings.directions];
}

export interface StudyCounts {
  due: number;
  newAvailable: number;
  newToday: number;
  seen: number;
}

interface Candidates {
  due: { item: SessionItem; r: number }[];
  fresh: SessionItem[];
  seen: { sid: string; dir: Dir; rec: CardRecord }[];
}

function collect(content: Content, levels: number[], settings: Settings, now: Date): Candidates {
  const cards = getState().cards;
  const dirs = allowedDirs(settings);
  const levelSet = new Set(levels);
  const due: Candidates['due'] = [];
  const fresh: SessionItem[] = [];
  const seen: Candidates['seen'] = [];

  for (const s of content.sentences) {
    if (!levelSet.has(s.level)) continue;
    // One direction per sentence: the most overdue due card wins, otherwise a new card.
    let best: { item: SessionItem; r: number } | undefined;
    let newDir: Dir | undefined;
    for (const dir of dirs) {
      const rec = cards[cardKey(s.id, dir, settings.learning)];
      if (isNewCard(rec)) {
        // In "both" mode the producing card is introduced only after the sentence has been read once.
        const readRec = cards[cardKey(s.id, 'r', settings.learning)];
        if (dir === 'p' && settings.directions === 'both' && isNewCard(readRec)) continue;
        if (!newDir) newDir = dir;
        continue;
      }
      seen.push({ sid: s.id, dir, rec: rec! });
      if (Date.parse(rec!.card.due) <= now.getTime()) {
        const r = retrievability(rec!.card, now, settings.retention);
        if (!best || r < best.r) best = { item: { sid: s.id, dir, kind: 'review' }, r };
      }
    }
    if (best) due.push(best);
    else if (newDir) fresh.push({ sid: s.id, dir: newDir, kind: 'new' });
  }
  return { due, fresh, seen };
}

export function studyCounts(content: Content, levels: number[], settings: Settings): StudyCounts {
  const c = collect(content, levels, settings, new Date());
  return { due: c.due.length, newAvailable: c.fresh.length, newToday: newIntroducedToday(settings.learning), seen: c.seen.length };
}

/** Builds a study session: due cards first (weakest first if there are too many), plus new cards, shuffled. */
export function buildSession(content: Content, levels: number[], settings: Settings): SessionItem[] {
  const now = new Date();
  const { due, fresh } = collect(content, levels, settings, now);
  const size = settings.sessionSize;
  // When more cards are due than fit, keep the ones most likely forgotten, with a little randomness.
  const dueSorted = due
    .map((d) => ({ ...d, key: d.r + Math.random() * 0.15 }))
    .sort((a, b) => a.key - b.key)
    .slice(0, size)
    .map((d) => d.item);
  const newBudget = Math.max(0, Math.min(settings.newPerDay - newIntroducedToday(settings.learning), size - dueSorted.length));
  // New cards: lower levels first, random order within a level.
  const newPicked = shuffle(fresh)
    .sort((a, b) => content.byId.get(a.sid)!.level - content.byId.get(b.sid)!.level)
    .slice(0, newBudget);
  return shuffle([...dueSorted, ...newPicked]);
}

/** How weak a card is, 0..1: low recall probability, high FSRS difficulty, many lapses, recent misses. */
export function weakness(rec: CardRecord, settings: Settings, now = new Date()): number {
  const r = retrievability(rec.card, now, settings.retention);
  const d = (rec.card.difficulty - 1) / 9;
  const lapses = Math.min(1, rec.card.lapses / 4);
  return Math.min(1, 0.45 * (1 - r) + 0.35 * d + 0.2 * lapses);
}

/** Extra practice: weighted random sample of already-seen cards, favouring weak ones. */
export function buildExtraPractice(content: Content, levels: number[], settings: Settings): SessionItem[] {
  const now = new Date();
  const { seen } = collect(content, levels, settings, now);
  const pool = seen.map((c) => ({ c, w: 0.05 + Math.pow(weakness(c.rec, settings, now), 1.5) }));
  const picked: SessionItem[] = [];
  const usedSentences = new Set<string>();
  // Efraimidis–Spirakis weighted sampling without replacement.
  const keyed = pool.map((p) => ({ ...p, k: Math.pow(Math.random(), 1 / p.w) })).sort((a, b) => b.k - a.k);
  for (const { c } of keyed) {
    if (picked.length >= settings.sessionSize) break;
    if (usedSentences.has(c.sid)) continue;
    usedSentences.add(c.sid);
    picked.push({ sid: c.sid, dir: c.dir, kind: 'extra' });
  }
  return picked;
}

/** Cards relearning within this window are shown again before the session ends. */
export const REQUEUE_WINDOW_MS = 20 * 60 * 1000;

export const sentenceOf = (content: Content, sid: string): Sentence | undefined => content.byId.get(sid);
