// What changed in each update, shown under Settings → What's new. Newest first. Every update that
// changes something people can see adds a few very short lines here (wrapped in msg() and
// translated in src/i18n/zh.ts, like any interface text).

import { msg } from '../i18n/msg';

export interface ChangelogEntry {
  /** YYYY-MM-DD */
  date: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-10-23',
    items: [
      msg('Pinyin duel: every reading counts (胖 = pàng or pán)'),
      msg('Pinyin duel: Easy, Medium and Hard clocks'),
      msg('Pinyin duel: a wrong guess costs time, not a life'),
      msg('Pinyin duel: only the player who missed sees the answer'),
      msg('Word summary after duels and speed rounds'),
      msg('Challenges wait in a banner while you use the app'),
      msg('Speed rounds: choose Definitions or Pinyin'),
      msg('This changelog'),
    ],
  },
  {
    date: '2026-10-22',
    items: [
      msg('Study single words and characters; add your own words'),
      msg('New games: Speed round, Reverse speed round, Pinyin duel'),
      msg('Word order removed'),
      msg('XP, levels, daily goals, streaks, challenges and badges'),
      msg('Natural voices for every sentence and word'),
      msg('Lend your voice: record sentences and rate recordings'),
      msg('English-learning mode with a Chinese interface'),
      msg('Game sentences no longer repeat until all have come up'),
    ],
  },
];
