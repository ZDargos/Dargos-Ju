import type { ComponentType } from 'react';
import type { Content } from '../lib/content';
import type { Sentence, Settings } from '../types';
import { tilesOf } from './common';
import WordOrder from './WordOrder';
import SentenceBuilder from './SentenceBuilder';
import SpotError from './SpotError';
import CloseCall from './CloseCall';
import Dictation from './Dictation';

export interface GameProps {
  sentence: Sentence;
  pool: Sentence[];
  content: Content;
  settings: Settings;
  hints: boolean;
  /** Live match: no hints, and only gradable modes. */
  vs?: boolean;
  /** `answer` is what the player gave, for the after-match summary. */
  onResult: (correct: boolean, answer?: string) => void;
  onNext: () => void;
}

export interface GameDef {
  id: string;
  title: string;
  icon: string;
  description: string;
  /** What the hint does; games without one have no hint switch. */
  hint?: string;
  component?: ComponentType<GameProps>;
  /** Which sentences the game can use. */
  eligible?: (s: Sentence, settings: Settings) => boolean;
  comingSoon?: boolean;
}

const tileRange = (min: number) => (s: Sentence, settings: Settings) => {
  const n = tilesOf(s).length;
  return n >= min && n <= settings.gameMaxTiles;
};

export const GAMES: GameDef[] = [
  {
    id: 'word-order',
    title: 'Word order',
    icon: '序',
    description: 'Rebuild the Chinese sentence from shuffled word tiles.',
    hint: 'A button that places the next word',
    component: WordOrder,
    eligible: tileRange(3),
  },
  {
    id: 'sentence-builder',
    title: 'Sentence builder',
    icon: '造',
    description: 'Translate with a word bank that has extra words, or build your own sentence.',
    hint: 'A button that places the next word',
    component: SentenceBuilder,
    eligible: tileRange(3),
  },
  {
    id: 'spot-error',
    title: 'Spot the error',
    icon: '错',
    description: 'One word is wrong, missing or extra. Tap where the mistake is.',
    hint: 'Show the English meaning',
    component: SpotError,
    eligible: tileRange(4),
  },
  {
    id: 'close-call',
    title: 'Close call',
    icon: '近',
    description: 'Pick the right Chinese for the English. The options differ by one detail.',
    hint: 'A button that removes one wrong option',
    component: CloseCall,
    eligible: tileRange(3),
  },
  {
    id: 'dictation',
    title: 'Dictation',
    icon: '听',
    description: 'Listen to a sentence, then rebuild it with tiles or type it.',
    hint: 'Show the English meaning',
    component: Dictation,
    eligible: tileRange(2),
  },
  {
    id: 'speed-round',
    title: 'Speed round',
    icon: '快',
    description: 'Vocabulary against the clock. Coming later.',
    comingSoon: true,
  },
];

export const gameById = (id: string) => GAMES.find((g) => g.id === id);

export const poolFor = (game: GameDef, content: Content, settings: Settings) => {
  const levels = new Set(settings.gameLevels);
  return content.sentences.filter((s) => levels.has(s.level) && (game.eligible ? game.eligible(s, settings) : true));
};
