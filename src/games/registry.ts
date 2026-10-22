import type { ComponentType } from 'react';
import type { Content } from '../lib/content';
import { project, tilesFor, type LearnLang, type LearnSentence } from '../lib/learn';
import type { Settings } from '../types';
import WordOrder from './WordOrder';
import SentenceBuilder from './SentenceBuilder';
import SpotError from './SpotError';
import CloseCall from './CloseCall';
import Dictation from './Dictation';
import { msg } from '../i18n/msg';

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
  title: string;
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
    id: 'word-order',
    title: msg('Word order'),
    icon: '序',
    description: msg('Rebuild the {target} sentence from shuffled word tiles.'),
    hint: msg('A button that places the next word'),
    component: WordOrder,
    minTiles: 3,
  },
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
    id: 'speed-round',
    title: msg('Speed round'),
    icon: '快',
    description: msg('Vocabulary against the clock. Coming later.'),
    comingSoon: true,
  },
];

export const gameById = (id: string) => GAMES.find((g) => g.id === id);

/** The game's sentences for the selected levels, seen from the given learning language. */
export function poolFor(game: GameDef, content: Content, settings: Settings, lang: LearnLang): LearnSentence[] {
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
