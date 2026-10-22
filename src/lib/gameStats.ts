// Game history: every answered round is recorded on the device (and synced), and vs match
// results are read from the matches table. These feed the per-game Stats panel and the summary
// at the bottom of the Games page.

import { setState } from './store';
import { scheduleSync } from './sync';
import { supabase } from './supabase';
import { currentUserId } from './social';
import type { GameRound } from '../types';

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export function recordRound(game: string, mode: 'solo' | 'vs', correct: boolean, ms: number, matchId?: string) {
  const round: GameRound = {
    id: uuid(),
    game,
    mode,
    correct,
    ms: Math.max(0, Math.round(ms)),
    matchId: matchId ?? null,
    at: new Date().toISOString(),
  };
  setState((s) => ({ rounds: [...s.rounds, round], unsyncedRounds: { ...s.unsyncedRounds, [round.id]: true } }));
  scheduleSync();
}

export interface PracticeStats {
  rounds: number;
  correct: number;
  accuracy: number | null;
  bestStreak: number;
  avgMs: number | null;
}

/** Practice (solo) rounds, optionally for one game. */
export function practiceStats(rounds: GameRound[], game?: string): PracticeStats {
  const list = rounds.filter((r) => r.mode === 'solo' && (!game || r.game === game));
  let best = 0;
  let run = 0;
  for (const r of list) {
    run = r.correct ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const correct = list.filter((r) => r.correct).length;
  return {
    rounds: list.length,
    correct,
    accuracy: list.length ? correct / list.length : null,
    bestStreak: best,
    avgMs: list.length ? list.reduce((n, r) => n + r.ms, 0) / list.length : null,
  };
}

export interface MatchRecord {
  id: string;
  game: string;
  opponentId: string;
  opponent: string;
  myScore: number;
  theirScore: number;
  myMs: number;
  theirMs: number;
  outcome: 'win' | 'loss' | 'tie';
  rounds: number;
  at: string;
}

/** Your finished vs matches, newest first. */
export async function fetchMatchHistory(): Promise<MatchRecord[]> {
  const me = await currentUserId();
  if (!me) return [];
  const { data, error } = await supabase
    .from('matches')
    .select('id, game, player_a, player_b, score_a, score_b, time_a, time_b, sentence_ids, finished_at')
    .eq('status', 'finished')
    .order('finished_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = data ?? [];
  const ids = [...new Set(rows.map((m) => (m.player_a === me ? m.player_b : m.player_a)).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', ids);
    for (const p of profiles ?? []) names.set(p.user_id, p.display_name);
  }
  return rows.map((m): MatchRecord => {
    const a = m.player_a === me;
    const myScore = (a ? m.score_a : m.score_b) ?? 0;
    const theirScore = (a ? m.score_b : m.score_a) ?? 0;
    const myMs = (a ? m.time_a : m.time_b) ?? 0;
    const theirMs = (a ? m.time_b : m.time_a) ?? 0;
    const opponentId = (a ? m.player_b : m.player_a) as string;
    const outcome: MatchRecord['outcome'] =
      myScore > theirScore || (myScore === theirScore && myMs < theirMs) ? 'win' : myScore === theirScore && myMs === theirMs ? 'tie' : 'loss';
    return {
      id: m.id,
      game: m.game,
      opponentId,
      opponent: names.get(opponentId) ?? 'Player',
      myScore,
      theirScore,
      myMs,
      theirMs,
      outcome,
      rounds: m.sentence_ids?.length ?? 8,
      at: m.finished_at,
    };
  });
}

export interface VsSummary {
  played: number;
  wins: number;
  losses: number;
  ties: number;
  avgScore: number | null;
  avgOpponentScore: number | null;
  avgMs: number | null;
  bestScore: number | null;
  fastestPerfectMs: number | null;
}

export function vsSummary(matches: MatchRecord[]): VsSummary {
  const n = matches.length;
  const avg = (f: (m: MatchRecord) => number) => (n ? matches.reduce((t, m) => t + f(m), 0) / n : null);
  const perfect = matches.filter((m) => m.myScore === m.rounds).map((m) => m.myMs);
  return {
    played: n,
    wins: matches.filter((m) => m.outcome === 'win').length,
    losses: matches.filter((m) => m.outcome === 'loss').length,
    ties: matches.filter((m) => m.outcome === 'tie').length,
    avgScore: avg((m) => m.myScore),
    avgOpponentScore: avg((m) => m.theirScore),
    avgMs: avg((m) => m.myMs),
    bestScore: n ? Math.max(...matches.map((m) => m.myScore)) : null,
    fastestPerfectMs: perfect.length ? Math.min(...perfect) : null,
  };
}

export interface OpponentRecord extends VsSummary {
  opponentId: string;
  opponent: string;
}

/** Head-to-head records, most-played opponent first. */
export function byOpponent(matches: MatchRecord[]): OpponentRecord[] {
  const groups = new Map<string, MatchRecord[]>();
  for (const m of matches) groups.set(m.opponentId, [...(groups.get(m.opponentId) ?? []), m]);
  return [...groups.entries()]
    .map(([opponentId, list]) => ({ opponentId, opponent: list[0].opponent, ...vsSummary(list) }))
    .sort((a, b) => b.played - a.played);
}

export const seconds = (ms: number | null) =>
  ms === null ? '–' : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
export const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`);
