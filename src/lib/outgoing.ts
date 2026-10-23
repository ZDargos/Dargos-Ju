// The challenge you've sent and are waiting on. It waits in the background (a banner at the top of
// the screen) while you use the rest of the app; there's only ever one, so sending a new challenge
// cancels the previous one. When the friend accepts, the app opens the match wherever you are.

import { useSyncExternalStore } from 'react';
import { cancelMatch, getMatch, watchMyMatches, type Match } from './match';
import { notifyChallenge } from './push';
import { getState } from './store';

/** Friends get a few minutes to answer: they may be opening the app from a notification. */
export const CHALLENGE_WAIT_MS = 3 * 60 * 1000;
const KEY = 'dj:outgoing';

export interface Outgoing {
  matchId: string;
  game: string;
  friend: string;
  createdAt: number;
}

export type OutgoingEvent = { type: 'accepted'; matchId: string } | { type: 'declined' | 'expired'; friend: string };

let current: Outgoing | null = null;
let stopWatching = () => {};
const listeners = new Set<() => void>();
const eventListeners = new Set<(e: OutgoingEvent) => void>();

function set(next: Outgoing | null) {
  current = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* only kept in memory */
  }
  listeners.forEach((l) => l());
}

const emit = (e: OutgoingEvent) => eventListeners.forEach((l) => l(e));

export function useOutgoing(): Outgoing | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** Calls back when the pending challenge is accepted, declined or runs out of time. */
export function onOutgoingEvent(fn: (e: OutgoingEvent) => void): () => void {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
}

function watch(o: Outgoing) {
  stopWatching();
  const me = getState().userId;
  if (!me) return;
  let done = false;
  const finish = (e: OutgoingEvent) => {
    if (done) return;
    done = true;
    stopWatching();
    set(null);
    emit(e);
  };
  const handle = (m: Match) => {
    if (m.id !== o.matchId) return;
    if (m.status === 'active' || m.status === 'finished') finish({ type: 'accepted', matchId: m.id });
    else if (m.status === 'cancelled') finish({ type: 'declined', friend: o.friend });
  };
  const unwatch = watchMyMatches(me, handle);
  const timer = setTimeout(() => {
    cancelMatch(o.matchId).catch(() => undefined);
    finish({ type: 'expired', friend: o.friend });
  }, Math.max(0, o.createdAt + CHALLENGE_WAIT_MS - Date.now()));
  // In case it was answered while we weren't listening (e.g. the app was reloaded).
  getMatch(o.matchId).then((m) => m && handle(m)).catch(() => undefined);
  stopWatching = () => {
    unwatch();
    clearTimeout(timer);
  };
}

/** Sends a challenge (created by `create`), replacing any challenge still waiting. */
export async function sendChallenge(friend: string, game: string, create: () => Promise<Match>): Promise<void> {
  await cancelChallenge();
  const m = await create();
  notifyChallenge(m.id);
  const o: Outgoing = { matchId: m.id, game, friend, createdAt: Date.now() };
  set(o);
  watch(o);
}

export async function cancelChallenge(): Promise<void> {
  const o = current;
  stopWatching();
  stopWatching = () => {};
  set(null);
  if (o) await cancelMatch(o.matchId).catch(() => undefined);
}

/** Picks up a challenge that was still waiting when the app was reloaded. */
export function resumeOutgoing() {
  if (current) return;
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Outgoing | null;
    if (!o) return;
    if (Date.now() - o.createdAt > CHALLENGE_WAIT_MS) {
      localStorage.removeItem(KEY);
      cancelMatch(o.matchId).catch(() => undefined);
      return;
    }
    set(o);
    watch(o);
  } catch {
    /* nothing to resume */
  }
}
