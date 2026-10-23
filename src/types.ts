/**
 * Card direction, from the learner's side: reading = see the language being learned and translate
 * it; producing = see your own language and produce the one being learned.
 */
export type Dir = 'r' | 'p';

/** 'zh' = learning Chinese (from English), 'en' = learning English (from Chinese). */
export type LearnLang = 'zh' | 'en';

export interface Sentence {
  id: string;
  level: number;
  zh: string;
  en: string;
  /** Word split saved at import time, including punctuation and Latin tokens. */
  tokens: string[];
  /** Proofread English used in English-learning mode (data/english-corrections.json or auto-cleaned). */
  enClean: string;
  /** Tokens of `enClean`. */
  enTokens: string[];
  custom?: boolean;
}

export interface Level {
  level: number;
  name: string;
  count: number;
}

/**
 * A word's pronunciation and short meaning. Chinese words: pinyin and English meaning. English
 * words (English mode): IPA and Chinese meaning. The field names date from the Chinese-only version.
 */
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
  /** Missing on older logs, which are all Chinese-learning. */
  lang?: LearnLang;
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
  lang?: LearnLang;
}

export type GameId = 'sentence-builder' | 'spot-error' | 'close-call' | 'dictation';

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
  /** Pinyin (or phonetics in English mode) switch per section ('study', a game id, 'stats'). */
  pinyin: Record<string, boolean>;
  /** Which language is being learned. */
  learning: LearnLang;
  /** App language: 'auto' follows the learning mode (Chinese interface when learning English). */
  uiLang: 'auto' | 'zh' | 'en';
  textSize: 'normal' | 'large' | 'xl';
  /** Set once the user has picked a learning mode (new accounts are asked first). */
  onboarded?: boolean;
  /** What the Study page studies: sentence cards or word cards. */
  studyDeck?: 'sentences' | 'words';
  /** Word study in Chinese mode: words, single characters, or both. */
  wordKind?: 'words' | 'chars' | 'both';
  /** New word cards per day (sentences use newPerDay). */
  wordsNewPerDay?: number;
  /** Daily XP goal changes (lib/xp.ts); each applies from its day on, so past days keep their goal. */
  goalHistory?: { from: string; xp: number }[];
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
    'sentence-builder': true,
    'spot-error': true,
    'close-call': true,
    dictation: true,
  },
  gameMaxTiles: 12,
  pinyin: {},
  learning: 'zh',
  uiLang: 'auto',
  textSize: 'normal',
};
