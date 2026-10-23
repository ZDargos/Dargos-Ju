// XP, player levels, daily goal, streak bonus, daily challenges and badges.
//
// Everything is worked out from history that already syncs (review logs, game rounds, finished vs
// matches, live voice recordings), so it's the same on every device and past activity counts.
// Rules (keep in sync with the "How XP works" panel on the Progress page):
// - A flashcard is worth the same XP whatever grade you give it, so nobody gains by grading
//   dishonestly (that would wreck their own review schedule). Daily challenges never depend on
//   self-grades either.
// - Answers given faster than anyone could read earn nothing, so tapping through doesn't pay.
// - A streak day means the daily goal was reached. The streak bonus grows 10% a day and maxes out
//   at +60% on day 7; missing a day resets it.
// - Voice lines earn XP only while they stay live, and that XP doesn't count toward daily goals,
//   since a recording voted down later would otherwise rewrite past days.

import { msg } from '../i18n/msg';
import type { GameRound, ReviewLog, Settings } from '../types';

export const XP_RULES = {
  card: 10,
  extraCard: 5,
  gameRight: 6,
  /** Speed rounds: per point of the day's net score (right minus wrong), so random tapping earns nothing. */
  speedPoint: 3,
  vsMatch: 20,
  vsWin: 30,
  voice: 10,
  challenge: 30,
  sweep: 50,
} as const;

export const GOALS = [50, 100, 200, 300];
export const DEFAULT_GOAL = 50;
const MIN_CARD_GAP_MS = 2000;
/** Timed multiple-choice games; scored by net points instead of per answer. */
const SPEED_GAMES = new Set(['speed-meaning', 'speed-word']);
const MIN_ROUND_MS = 1500;
const STREAK_STEP = 0.1;
const STREAK_MAX_DAYS = 6;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar day, YYYY-MM-DD. */
export const dayKey = (d: Date | string | number) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
};

// ---------- Levels ----------

/** Total XP needed to reach a level (level 1 starts at 0; each level needs 50 more than the last). */
export const xpForLevel = (level: number) => 100 * (level - 1) + 25 * (level - 1) * (level - 2);

export function levelFor(total: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= total) level++;
  return level;
}

const TITLES: [number, string][] = [
  [1, msg('Beginner')],
  [5, msg('Learner')],
  [10, msg('Intermediate')],
  [15, msg('Skilled')],
  [20, msg('Expert')],
  [30, msg('Master')],
  [40, msg('Grandmaster')],
  [50, msg('Legend')],
];

/** The title for a level (an English key for t()). */
export const titleFor = (level: number) => TITLES.filter(([l]) => l <= level).at(-1)![1];

// ---------- Daily goal ----------

export interface GoalChange {
  from: string;
  xp: number;
}

/** The goal that applied on a given day; changing your goal never rewrites past days. */
export function goalFor(day: string, history: GoalChange[] | undefined): number {
  let goal = DEFAULT_GOAL;
  for (const g of [...(history ?? [])].sort((a, b) => a.from.localeCompare(b.from))) if (g.from <= day) goal = g.xp;
  return goal;
}

/** Settings patch that sets today's goal. */
export function goalChange(xp: number, history: GoalChange[] | undefined): Pick<Settings, 'goalHistory'> {
  const today = dayKey(Date.now());
  return { goalHistory: [...(history ?? []).filter((g) => g.from !== today), { from: today, xp }] };
}

// ---------- Activity per day ----------

export interface DayStats {
  cards: number;
  newCards: number;
  extraCards: number;
  gameRight: number;
  /** Correct answers per game. */
  rightByGame: Record<string, number>;
  gamesPlayed: Set<string>;
  /** Longest run of correct answers in one game. */
  bestRun: number;
  vsMatches: number;
  vsWins: number;
  /** Speed round answers: right minus wrong. */
  speedNet: number;
}

const emptyDay = (): DayStats => ({ cards: 0, newCards: 0, extraCards: 0, gameRight: 0, rightByGame: {}, gamesPlayed: new Set(), bestRun: 0, vsMatches: 0, vsWins: 0, speedNet: 0 });

/** A finished vs match, for XP. */
export interface VsResult {
  id: string;
  at: string;
  win: boolean;
}

function dailyStats(logs: ReviewLog[], rounds: GameRound[], vs: VsResult[]): Map<string, DayStats> {
  const days = new Map<string, DayStats>();
  const get = (day: string) => {
    let d = days.get(day);
    if (!d) days.set(day, (d = emptyDay()));
    return d;
  };
  let prev = 0;
  for (const l of [...logs].sort((a, b) => a.at.localeCompare(b.at))) {
    const at = Date.parse(l.at);
    const quick = at - prev < MIN_CARD_GAP_MS;
    prev = at;
    if (quick) continue;
    const d = get(dayKey(at));
    if (l.mode === 'extra') d.extraCards++;
    else {
      d.cards++;
      if (l.mode === 'new') d.newCards++;
    }
  }
  const runs: Record<string, number> = {};
  for (const r of [...rounds].sort((a, b) => a.at.localeCompare(b.at))) {
    const d = get(dayKey(r.at));
    d.gamesPlayed.add(r.game);
    if (SPEED_GAMES.has(r.game)) {
      d.speedNet += r.correct ? 1 : -1;
      continue;
    }
    const key = `${dayKey(r.at)}|${r.game}`;
    if (r.correct && r.ms >= MIN_ROUND_MS) {
      d.gameRight++;
      d.rightByGame[r.game] = (d.rightByGame[r.game] ?? 0) + 1;
      runs[key] = (runs[key] ?? 0) + 1;
      d.bestRun = Math.max(d.bestRun, runs[key]);
    } else if (!r.correct) runs[key] = 0;
  }
  for (const m of vs) {
    const d = get(dayKey(m.at));
    d.vsMatches++;
    if (m.win) d.vsWins++;
  }
  return days;
}

const activityXp = (d: DayStats) =>
  Math.max(0, d.speedNet) * XP_RULES.speedPoint +
  d.cards * XP_RULES.card + d.extraCards * XP_RULES.extraCard + d.gameRight * XP_RULES.gameRight + d.vsMatches * XP_RULES.vsMatch + d.vsWins * XP_RULES.vsWin;

// ---------- Daily challenges ----------

export type ChallengeKind = 'cards' | 'new' | 'extra' | 'gameRight' | 'games' | 'run' | 'game';

export interface Challenge {
  kind: ChallengeKind;
  target: number;
  /** For 'game': which game. */
  game?: string;
}

// Games used by daily challenges. Past days keep the list they had, so their XP and streaks never
// change when games are added or removed: add a new entry with the first day it applies.
const CHALLENGE_GAMES: [string, string[]][] = [
  ['0000-00-00', ['word-order', 'sentence-builder', 'spot-error', 'close-call', 'dictation']],
  ['2026-10-23', ['sentence-builder', 'spot-error', 'close-call', 'dictation']],
  ['2026-10-24', ['sentence-builder', 'spot-error', 'close-call', 'dictation', 'word-duel']],
];
const challengeGamesOn = (day: string) => CHALLENGE_GAMES.filter(([from]) => from <= day).at(-1)![1];
const TARGETS: Record<ChallengeKind, number[]> = {
  cards: [15, 25, 40],
  new: [3, 5, 8],
  extra: [10, 15],
  gameRight: [8, 12, 20],
  games: [2, 3],
  run: [4, 6, 8],
  game: [5, 8],
};

function seeded(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

/** Three challenges for a day: one with flashcards, one with games, one of either. The same for everyone. */
export function challengesFor(day: string): Challenge[] {
  const rnd = seeded(`dj-challenges-${day}`);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const cardKinds: ChallengeKind[] = ['cards', 'new', 'extra'];
  const gameKinds: ChallengeKind[] = ['gameRight', 'games', 'run', 'game'];
  const first = pick(cardKinds);
  const second = pick(gameKinds);
  const third = pick([...cardKinds, ...gameKinds].filter((k) => k !== first && k !== second));
  return [first, second, third].map((kind) => ({ kind, target: pick(TARGETS[kind]), ...(kind === 'game' ? { game: pick(challengeGamesOn(day)) } : {}) }));
}

export function challengeProgress(c: Challenge, d: DayStats | undefined): number {
  if (!d) return 0;
  switch (c.kind) {
    case 'cards':
      return d.cards;
    case 'new':
      return d.newCards;
    case 'extra':
      return d.extraCards;
    case 'gameRight':
      return d.gameRight;
    case 'games':
      return d.gamesPlayed.size;
    case 'run':
      return d.bestRun;
    case 'game':
      return d.rightByGame[c.game!] ?? 0;
  }
}

// ---------- Summary ----------

export interface DaySummary {
  day: string;
  xp: number;
  goal: number;
  met: boolean;
  multiplier: number;
  challengesDone: number;
}

export interface XpSummary {
  total: number;
  level: number;
  levelStart: number;
  nextLevelAt: number;
  today: DaySummary & { challenges: { challenge: Challenge; progress: number; done: boolean }[]; stats: DayStats };
  /** Goal days in a row, counting today once its goal is met. */
  streak: number;
  bestStreak: number;
  days: DaySummary[];
  totals: { cards: number; cardsZh: number; cardsEn: number; gameRight: number; bestRun: number; gamesPlayed: Set<string>; vsWins: number; voices: number; sweeps: number };
}

export interface XpInput {
  logs: ReviewLog[];
  rounds: GameRound[];
  vs: VsResult[];
  /** How many of your voice recordings are live. */
  liveVoices: number;
  goalHistory: GoalChange[] | undefined;
  now?: number;
}

export function computeXp({ logs, rounds, vs, liveVoices, goalHistory, now = Date.now() }: XpInput): XpSummary {
  const stats = dailyStats(logs, rounds, vs);
  const today = dayKey(now);
  const firstDay = [...stats.keys()].sort()[0] ?? today;
  const days: DaySummary[] = [];
  let streakBefore = 0;
  let bestStreak = 0;
  let sweeps = 0;
  let total = 0;
  for (let day = firstDay; day <= today; day = addDays(day, 1)) {
    const d = stats.get(day);
    const goal = goalFor(day, goalHistory);
    const multiplier = 1 + STREAK_STEP * Math.min(streakBefore, STREAK_MAX_DAYS);
    const challengesDone = challengesFor(day).filter((c) => challengeProgress(c, d) >= c.target).length;
    if (challengesDone === 3) sweeps++;
    const xp = Math.round((d ? activityXp(d) : 0) * multiplier) + challengesDone * XP_RULES.challenge + (challengesDone === 3 ? XP_RULES.sweep : 0);
    const met = xp >= goal;
    total += xp;
    days.push({ day, xp, goal, met, multiplier, challengesDone });
    if (day < today || met) {
      streakBefore = met ? streakBefore + 1 : 0;
      bestStreak = Math.max(bestStreak, streakBefore);
    }
  }
  total += liveVoices * XP_RULES.voice;

  const t = days.at(-1)!;
  const todayStats = stats.get(today) ?? emptyDay();
  const level = levelFor(total);
  const totals = { cards: 0, cardsZh: 0, cardsEn: 0, gameRight: 0, bestRun: 0, gamesPlayed: new Set<string>(), vsWins: 0, voices: liveVoices, sweeps };
  for (const l of logs) {
    totals.cards++;
    if ((l.lang ?? 'zh') === 'zh') totals.cardsZh++;
    else totals.cardsEn++;
  }
  for (const d of stats.values()) {
    totals.gameRight += d.gameRight;
    totals.bestRun = Math.max(totals.bestRun, d.bestRun);
    d.gamesPlayed.forEach((g) => totals.gamesPlayed.add(g));
    totals.vsWins += d.vsWins;
  }
  return {
    total,
    level,
    levelStart: xpForLevel(level),
    nextLevelAt: xpForLevel(level + 1),
    today: {
      ...t,
      stats: todayStats,
      challenges: challengesFor(today).map((challenge) => {
        const progress = challengeProgress(challenge, todayStats);
        return { challenge, progress, done: progress >= challenge.target };
      }),
    },
    streak: streakBefore,
    bestStreak,
    days,
    totals,
  };
}

// ---------- Badges ----------

export interface BadgeDef {
  id: string;
  icon: string;
  name: string;
  /** What is counted toward the tiers. */
  desc: string;
  tiers: number[];
  value: (s: XpSummary) => number;
}

export const BADGES: BadgeDef[] = [
  { id: 'streak', icon: '🔥', name: msg('Streak'), desc: msg('Days in a row reaching your daily goal'), tiers: [3, 7, 30, 100], value: (s) => s.bestStreak },
  { id: 'cards', icon: '🃏', name: msg('Flashcard Hero'), desc: msg('Flashcards reviewed'), tiers: [100, 1000, 5000], value: (s) => s.totals.cards },
  { id: 'games', icon: '🎯', name: msg('Game Ace'), desc: msg('Correct game answers'), tiers: [50, 500, 2000], value: (s) => s.totals.gameRight },
  { id: 'run', icon: '⚡', name: msg('Hot Hand'), desc: msg('Correct answers in a row in one game'), tiers: [10, 25, 50], value: (s) => s.totals.bestRun },
  { id: 'allround', icon: '🧭', name: msg('All-Rounder'), desc: msg('Different games played'), tiers: [5], value: (s) => s.totals.gamesPlayed.size },
  { id: 'vs', icon: '⚔️', name: msg('Duelist'), desc: msg('Vs matches won'), tiers: [1, 10, 50], value: (s) => s.totals.vsWins },
  { id: 'voice', icon: '🎙️', name: msg('Voice of Dargos'), desc: msg('Voice lines live'), tiers: [10, 100, 500], value: (s) => s.totals.voices },
  { id: 'sweep', icon: '🏅', name: msg('Daily Sweeper'), desc: msg('Days with every daily challenge cleared'), tiers: [1, 10, 50], value: (s) => s.totals.sweeps },
  { id: 'twoway', icon: '🔁', name: msg('Two-Way'), desc: msg('Cards reviewed in each learning mode'), tiers: [100], value: (s) => Math.min(s.totals.cardsZh, s.totals.cardsEn) },
];

export const TIER_NAMES = [msg('Bronze'), msg('Silver'), msg('Gold'), msg('Diamond')];

export interface BadgeStatus {
  def: BadgeDef;
  /** Tiers earned (0 = not yet). */
  tier: number;
  value: number;
  /** Target of the next tier, or null when all are earned. */
  next: number | null;
}

export function badgeStatus(def: BadgeDef, s: XpSummary): BadgeStatus {
  const value = def.value(s);
  const tier = def.tiers.filter((n) => value >= n).length;
  return { def, tier, value, next: def.tiers[tier] ?? null };
}
