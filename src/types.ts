/** Card direction: reading (Chinese → English) or producing (English → Chinese). */
export type Dir = 'r' | 'p';

export interface Sentence {
  id: string;
  level: number;
  zh: string;
  en: string;
  /** Word split saved at import time, including punctuation and Latin tokens. */
  tokens: string[];
  custom?: boolean;
}

export interface Level {
  level: number;
  name: string;
  count: number;
}

export interface LexEntry {
  py: string;
  en: string;
}

/** ts-fsrs Card with dates stored as ISO strings. */
export interface StoredCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string | null;
}

export interface CardRecord {
  card: StoredCard;
  updatedAt: string;
}

/** 1 = Wrong (Again), 2 = Mostly right (Hard), 3 = Right (Good). */
export type Grade = 1 | 2 | 3;

/** new: first time the card was seen; review: scheduled review; extra: optional extra practice. */
export type ReviewMode = 'new' | 'review' | 'extra';

export interface ReviewLog {
  id: string;
  sid: string;
  dir: Dir;
  grade: Grade;
  at: string;
  mode: ReviewMode;
}

/** One answered game round, for game stats. */
export interface GameRound {
  id: string;
  game: string;
  mode: 'solo' | 'vs';
  correct: boolean;
  /** Time from the sentence appearing to the answer. */
  ms: number;
  matchId?: string | null;
  at: string;
}

export type GameId = 'word-order' | 'sentence-builder' | 'spot-error' | 'close-call' | 'dictation';

export interface Settings {
  studyLevels: number[];
  gameLevels: number[];
  directions: 'both' | Dir;
  sessionSize: number;
  newPerDay: number;
  retention: number;
  speechRate: number;
  theme: 'system' | 'light' | 'dark';
  /** Per-game hint switches. */
  hints: Record<GameId, boolean>;
  /** Longest sentence (in word tiles) used by tile games. */
  gameMaxTiles: number;
}

export const DEFAULT_SETTINGS: Settings = {
  studyLevels: [],
  gameLevels: [],
  directions: 'both',
  sessionSize: 20,
  newPerDay: 15,
  retention: 0.9,
  speechRate: 0.85,
  theme: 'system',
  hints: {
    'word-order': true,
    'sentence-builder': true,
    'spot-error': true,
    'close-call': true,
    dictation: true,
  },
  gameMaxTiles: 12,
};
