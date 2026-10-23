// Spaced repetition with FSRS (ts-fsrs). Each sentence has two cards: reading and producing.
// Sessions shuffle the due cards, add a few new ones, and never include both directions of the
// same sentence. Extra practice samples already-seen cards weighted toward the weakest ones.

import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type FSRS } from 'ts-fsrs';
import { getState, setState } from './store';
import { scheduleSync } from './sync';
import { t } from '../i18n';
import type { Content } from './content';
import { isWordId } from './vocab';
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

/** New cards started today in a language, counted separately for sentences and words. */
export function newIntroducedToday(lang: LearnLang = getState().settings.learning, words = false): number {
  const since = startOfToday().toISOString();
  return getState().logs.filter((l) => l.mode === 'new' && l.at >= since && logLang(l) === lang && isWordId(l.sid) === words).length;
}

// ---------- Hidden cards ----------

/** Cards someone chose never to see again (card keys, per learning mode). */
export const hiddenSet = (settings: Settings) => new Set(settings.hiddenCards ?? []);

/** Settings patch that hides or shows cards. */
export function setCardsHidden(keys: string[], hide: boolean, settings: Settings): Pick<Settings, 'hiddenCards'> {
  const set = hiddenSet(settings);
  for (const k of keys) {
    if (hide) set.add(k);
    else set.delete(k);
  }
  return { hiddenCards: [...set] };
}

/** Something with two cards (reading and producing): a sentence, or a word ("w:" ids). */
export interface StudyUnit {
  id: string;
  level: number;
}

export const sentenceUnits = (content: Content, levels: number[]): StudyUnit[] => {
  const set = new Set(levels);
  return content.sentences.filter((s) => set.has(s.level)).map((s) => ({ id: s.id, level: s.level }));
};

const isWordDeck = (units: StudyUnit[]) => units.length > 0 && isWordId(units[0].id);
const newLimit = (settings: Settings, words: boolean) => (words ? settings.wordsNewPerDay ?? 15 : settings.newPerDay);

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

function collect(units: StudyUnit[], settings: Settings, now: Date): Candidates {
  const cards = getState().cards;
  const hidden = hiddenSet(settings);
  const dirs = allowedDirs(settings);
  const due: Candidates['due'] = [];
  const fresh: SessionItem[] = [];
  const seen: Candidates['seen'] = [];

  for (const s of units) {
    // One direction per sentence: the most overdue due card wins, otherwise a new card.
    let best: { item: SessionItem; r: number } | undefined;
    let newDir: Dir | undefined;
    for (const dir of dirs) {
      if (hidden.has(cardKey(s.id, dir, settings.learning))) continue;
      const rec = cards[cardKey(s.id, dir, settings.learning)];
      if (isNewCard(rec)) {
        // In "both" mode the producing card is introduced only after the sentence has been read once
        // (unless the reading card is hidden).
        const readRec = cards[cardKey(s.id, 'r', settings.learning)];
        if (dir === 'p' && settings.directions === 'both' && isNewCard(readRec) && !hidden.has(cardKey(s.id, 'r', settings.learning))) continue;
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

export function studyCounts(units: StudyUnit[], settings: Settings): StudyCounts {
  const c = collect(units, settings, new Date());
  return { due: c.due.length, newAvailable: c.fresh.length, newToday: newIntroducedToday(settings.learning, isWordDeck(units)), seen: c.seen.length };
}

/** Builds a study session: due cards first (weakest first if there are too many), plus new cards, shuffled. */
export function buildSession(units: StudyUnit[], settings: Settings): SessionItem[] {
  const now = new Date();
  const { due, fresh } = collect(units, settings, now);
  const words = isWordDeck(units);
  const levelOf = new Map(units.map((u) => [u.id, u.level]));
  const size = settings.sessionSize;
  // When more cards are due than fit, keep the ones most likely forgotten, with a little randomness.
  const dueSorted = due
    .map((d) => ({ ...d, key: d.r + Math.random() * 0.15 }))
    .sort((a, b) => a.key - b.key)
    .slice(0, size)
    .map((d) => d.item);
  const newBudget = Math.max(0, Math.min(newLimit(settings, words) - newIntroducedToday(settings.learning, words), size - dueSorted.length));
  // New cards: lower levels first, random order within a level.
  const newPicked = shuffle(fresh)
    .sort((a, b) => levelOf.get(a.sid)! - levelOf.get(b.sid)!)
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
export function buildExtraPractice(units: StudyUnit[], settings: Settings): SessionItem[] {
  const now = new Date();
  const { seen } = collect(units, settings, now);
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

// ---------- Full deck ----------
// "Full deck" study goes through every card of the selected levels once, in a shuffled order,
// before the deck is shuffled again. Each combination of levels (and mode, deck and directions) has
// its own order, remembered on this device. Reading cards come before producing cards in a pass.

interface FullDeckState {
  order: string[];
  done: string[];
}

const fullDeckKey = (units: StudyUnit[], settings: Settings) => {
  const levels = [...new Set(units.map((u) => u.level))].sort((a, b) => a - b).join(',');
  return `dj:full-deck:${getState().userId ?? 'anon'}:${settings.learning}:${isWordDeck(units) ? 'words' : 'sentences'}:${settings.directions}:${levels}`;
};

const itemId = (i: { sid: string; dir: Dir }) => `${i.sid}|${i.dir}`;

function deckCards(units: StudyUnit[], settings: Settings): string[] {
  const hidden = hiddenSet(settings);
  const out: string[] = [];
  for (const dir of allowedDirs(settings))
    for (const u of units) if (!hidden.has(cardKey(u.id, dir, settings.learning))) out.push(itemId({ sid: u.id, dir }));
  return out;
}

/** A new pass: reading cards shuffled, then producing cards shuffled. */
const freshOrder = (cards: string[]) => [...shuffle(cards.filter((c) => c.endsWith('|r'))), ...shuffle(cards.filter((c) => c.endsWith('|p')))];

function loadFullDeck(units: StudyUnit[], settings: Settings): { key: string; state: FullDeckState; cards: string[] } {
  const key = fullDeckKey(units, settings);
  const cards = deckCards(units, settings);
  const present = new Set(cards);
  let state: FullDeckState | null = null;
  try {
    state = JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    /* start a new pass */
  }
  if (!state) state = { order: freshOrder(cards), done: [] };
  // Cards hidden or removed since drop out; new ones join the end of this pass.
  const inOrder = new Set(state.order);
  const order = [...state.order.filter((c) => present.has(c)), ...freshOrder(cards.filter((c) => !inOrder.has(c)))];
  const done = state.done.filter((c) => present.has(c));
  state = { order, done };
  if (order.length && done.length >= order.length) state = { order: freshOrder(cards), done: [] };
  return { key, state, cards };
}

function saveFullDeck(key: string, state: FullDeckState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* progress through the pass isn't remembered */
  }
}

/** Where you are in the current pass. */
export function fullDeckProgress(units: StudyUnit[], settings: Settings): { done: number; total: number } {
  const { state } = loadFullDeck(units, settings);
  return { done: state.done.length, total: state.order.length };
}

/** The rest of the current pass, in order. */
export function buildFullDeck(units: StudyUnit[], settings: Settings): SessionItem[] {
  const { key, state } = loadFullDeck(units, settings);
  saveFullDeck(key, state);
  const done = new Set(state.done);
  const cards = getState().cards;
  return state.order
    .filter((c) => !done.has(c))
    .map((c) => {
      const i = c.lastIndexOf('|');
      const sid = c.slice(0, i);
      const dir = c.slice(i + 1) as Dir;
      return { sid, dir, kind: isNewCard(cards[cardKey(sid, dir, settings.learning)]) ? 'new' : 'review' } as SessionItem;
    });
}

/** Marks a card done in this pass. Returns true when the pass is complete. */
export function markFullDeckDone(units: StudyUnit[], settings: Settings, item: { sid: string; dir: Dir }): boolean {
  const { key, state } = loadFullDeck(units, settings);
  const id = itemId(item);
  if (!state.done.includes(id)) state.done.push(id);
  saveFullDeck(key, state);
  return state.done.length >= state.order.length;
}
