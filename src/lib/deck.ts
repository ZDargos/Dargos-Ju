// Picks practice-game sentences like dealing from a shuffled deck: every sentence in the pool comes
// up exactly once, in random order, before any sentence repeats. The deck is remembered per game
// and learning language on this device, so it carries on between sessions instead of starting over.

import { getState } from './store';
import type { LearnLang } from './learn';

interface Deck {
  /** Sentences already dealt in the current pass. */
  used: string[];
  /** The last few dealt, so a new pass doesn't open with something just seen. */
  recent: string[];
}

const storageKey = (game: string, lang: LearnLang) => `dj:deck:${getState().userId ?? 'anon'}:${lang}:${game}`;

function load(key: string): Deck {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (d && Array.isArray(d.used) && Array.isArray(d.recent)) return d;
  } catch {
    /* unreadable or blocked storage: start a fresh deck */
  }
  return { used: [], recent: [] };
}

function save(key: string, deck: Deck) {
  try {
    localStorage.setItem(key, JSON.stringify(deck));
  } catch {
    /* storage full or blocked: the deck just won't carry over */
  }
}

/** Deals the next sentence for a game. Uniformly random among the sentences not yet dealt this pass. */
export function drawSentence<T extends { id: string }>(game: string, lang: LearnLang, pool: T[]): T | undefined {
  if (!pool.length) return undefined;
  const key = storageKey(game, lang);
  const deck = load(key);
  const inPool = new Set(pool.map((s) => s.id));
  let used = new Set(deck.used.filter((id) => inPool.has(id)));
  let left = pool.filter((s) => !used.has(s.id));
  if (!left.length) {
    used = new Set();
    left = pool;
  }
  const recent = new Set(deck.recent);
  const fresh = left.filter((s) => !recent.has(s.id));
  const choices = fresh.length ? fresh : left;
  const s = choices[Math.floor(Math.random() * choices.length)];
  used.add(s.id);
  save(key, { used: [...used], recent: [...deck.recent, s.id].slice(-Math.min(20, Math.floor(pool.length / 2))) });
  return s;
}
