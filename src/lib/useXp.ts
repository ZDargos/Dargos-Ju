// React side of XP: gathers the inputs (synced history, finished vs matches, live voice lines),
// keeps the XP shown to friends up to date, and caches vs results for offline use.

import { useMemo, useSyncExternalStore } from 'react';
import { getState, useStore } from './store';
import { useVoices } from './voices';
import { fetchMatchHistory } from './gameStats';
import { supabase } from './supabase';
import { computeXp, type VsResult, type XpSummary } from './xp';

let vs: VsResult[] = [];
let vsUser: string | null = null;
const listeners = new Set<() => void>();
const cacheKey = (uid: string) => `dj:vs-results:${uid}`;

function vsFor(uid: string | null): VsResult[] {
  if (uid !== vsUser) {
    vsUser = uid;
    vs = [];
    try {
      if (uid) vs = JSON.parse(localStorage.getItem(cacheKey(uid)) ?? '[]');
    } catch {
      /* no cache */
    }
  }
  return vs;
}

/** Downloads finished vs matches (wins earn XP). */
export async function refreshVsResults(): Promise<void> {
  const uid = getState().userId;
  if (!uid || uid === 'demo') return;
  const matches = await fetchMatchHistory();
  vsFor(uid);
  // A duel that ends level on lives is a draw that counts as a win for both players.
  vs = matches.map((m) => ({ id: m.id, at: m.at, win: m.outcome === 'win' || (m.game === 'word-duel' && m.outcome === 'tie') }));
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify(vs));
  } catch {
    /* kept in memory */
  }
  listeners.forEach((l) => l());
}

export function useXp(): XpSummary {
  const logs = useStore((s) => s.logs);
  const rounds = useStore((s) => s.rounds);
  const goalHistory = useStore((s) => s.settings.goalHistory);
  const me = useStore((s) => s.userId);
  const voices = useVoices();
  const results = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => vsFor(me),
  );
  const liveVoices = useMemo(() => [...voices.byKey.values()].filter((r) => r.user_id === me).length, [voices, me]);
  // Recomputed at most once a minute for the same inputs, so the day rolls over on its own.
  const minute = Math.floor(Date.now() / 60000);
  return useMemo(() => computeXp({ logs, rounds, vs: results, liveVoices, goalHistory }), [logs, rounds, results, liveVoices, goalHistory, minute]); // eslint-disable-line react-hooks/exhaustive-deps
}

let pushed: number | null = null;

/** Saves your total XP on your profile so friends can see your level. */
export async function pushXp(total: number): Promise<void> {
  const uid = getState().userId;
  if (!uid || uid === 'demo' || pushed === total) return;
  const { error } = await supabase.from('profiles').update({ xp: total }).eq('user_id', uid);
  if (!error) pushed = total;
}
