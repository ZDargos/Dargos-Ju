import type { ComponentType } from 'react';
import type { Content } from '../lib/content';
import { project, tilesFor, type LearnLang, type LearnSentence } from '../lib/learn';
import type { Settings } from '../types';
import SentenceBuilder from './SentenceBuilder';
import SpotError from './SpotError';
import CloseCall from './CloseCall';
import Dictation from './Dictation';
import { msg } from '../i18n/msg';
import { t } from '../i18n';
import { vocabFor, type VocabItem } from '../lib/vocab';
import { myVocab } from '../lib/myWords';

export interface GameProps {
  /** The sentence for this round, from the player's side (target = language being learned). */
  sentence: LearnSentence;
  /** Other sentences from the same levels, for distractors. */
  pool: LearnSentence[];
  content: Content;
  settings: Settings;
  hints: boolean;
  /** Live match: no hints, and only gradable modes. */
  vs?: boolean;
  /** `answer` is what the player gave, for the after-match summary. */
  onResult: (correct: boolean, answer?: string) => void;
  onNext: () => void;
}

/** Texts are English source strings for t(); {target} and {native} become the language names. */
export interface GameDef {
  id: string;
  /** 'sentence' games play one sentence per round; vocabulary games ('speed', 'duel') use words. */
  kind?: 'sentence' | 'speed' | 'duel';
  title: string;
  /** Title in English-learning mode, when it differs. */
  titleEn?: string;
  icon: string;
  description: string;
  /** What the hint does; games without one have no hint switch. */
  hint?: string;
  component?: ComponentType<GameProps>;
  /** Fewest word tiles a sentence needs for this game. */
  minTiles?: number;
  comingSoon?: boolean;
}

export const GAMES: GameDef[] = [
  {
    id: 'sentence-builder',
    title: msg('Sentence builder'),
    icon: '造',
    description: msg('Translate with a word bank that has extra words, or build your own sentence.'),
    hint: msg('A button that places the next word'),
    component: SentenceBuilder,
    minTiles: 3,
  },
  {
    id: 'spot-error',
    title: msg('Spot the error'),
    icon: '错',
    description: msg('One word is wrong, missing or extra. Tap where the mistake is.'),
    hint: msg('Show the {native} meaning'),
    component: SpotError,
    minTiles: 4,
  },
  {
    id: 'close-call',
    title: msg('Close call'),
    icon: '近',
    description: msg('Pick the right {target} for the {native}. The options differ by one detail.'),
    hint: msg('A button that removes one wrong option'),
    component: CloseCall,
    minTiles: 3,
  },
  {
    id: 'dictation',
    title: msg('Dictation'),
    icon: '听',
    description: msg('Listen to a sentence, then rebuild it with tiles or type it.'),
    hint: msg('Show the {native} meaning'),
    component: Dictation,
    minTiles: 2,
  },
  {
    id: 'speed-meaning',
    kind: 'speed',
    title: msg('Speed round'),
    icon: '快',
    description: msg('Tap the right meaning for as many {target} words as you can in 30 seconds. A wrong answer costs a point.'),
  },
  {
    id: 'speed-word',
    kind: 'speed',
    title: msg('Reverse speed round'),
    icon: '反',
    description: msg('See the meaning and tap the right {target} word, as many as you can in 30 seconds. A wrong answer costs a point.'),
  },
  {
    id: 'word-duel',
    kind: 'duel',
    title: msg('Pinyin duel'),
    titleEn: msg('Spelling duel'),
    icon: '斗',
    description: msg('Take turns typing the answer before the clock runs out; it gets faster as you go. Miss and you lose a life, and your opponent gets one chance at the same word. 4 lives each.'),
  },
];

/** Games that were removed: kept only so old stats and vs history still show their names. */
const RETIRED_GAMES: GameDef[] = [{ id: 'word-order', title: msg('Word order'), icon: '序', description: '', comingSoon: true }];

/** A game's name in the interface language, for the given learning mode. */
export const gameName = (g: GameDef | undefined, lang: LearnLang) => (g ? t(lang === 'en' && g.titleEn ? g.titleEn : g.title) : '');

export const isVocabGame = (g: GameDef | undefined) => !!g && (g.kind === 'speed' || g.kind === 'duel');

/** Fewest words a vocabulary game needs. */
export const MIN_VOCAB = 12;

/** Words for the vocabulary games: words and characters of the selected levels, plus "My words". */
export function vocabPoolFor(content: Content, settings: Settings, lang: LearnLang, levels: number[] = settings.gameLevels): VocabItem[] {
  const seen = new Set<string>();
  return [...vocabFor(content, lang, levels, 'both'), ...myVocab(lang)].filter((v) => v.gloss && (lang === 'en' || v.py) && !seen.has(v.id) && seen.add(v.id));
}

export const gameById = (id: string) => GAMES.find((g) => g.id === id) ?? RETIRED_GAMES.find((g) => g.id === id);

/** The game's sentences for the selected levels, seen from the given learning language. */
export function poolFor(game: GameDef, content: Content, settings: Settings, lang: LearnLang): LearnSentence[] {
  if (isVocabGame(game)) return [];
  const levels = new Set(settings.gameLevels);
  const out: LearnSentence[] = [];
  for (const s of content.sentences) {
    if (!levels.has(s.level)) continue;
    const ls = project(s, lang);
    const n = tilesFor(ls, content).length;
    if (n >= (game.minTiles ?? 1) && n <= settings.gameMaxTiles) out.push(ls);
  }
  return out;
}
