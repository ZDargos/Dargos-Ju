// Live head-to-head matches. Both players get the same sentences (stored on the match row) and
// race through them; progress is shared over a Supabase Realtime broadcast channel, and final
// scores are written through database functions so neither side can edit the other's result.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { shuffle } from './srs';
import { gameById, poolFor } from '../games/registry';
import type { Content } from './content';
import type { Settings } from '../types';

export const ROUNDS = 8;

export interface Match {
  id: string;
  game: string;
  sentence_ids: string[];
  status: 'waiting' | 'active' | 'finished' | 'cancelled';
  is_public: boolean;
  player_a: string;
  player_b: string | null;
  score_a: number | null;
  score_b: number | null;
  time_a: number | null;
  time_b: number | null;
  created_at: string;
  started_at: string | null;
  progress_a: number;
  progress_b: number;
}

export function pickSentences(gameId: string, content: Content, settings: Settings): string[] {
  const game = gameById(gameId);
  if (!game) return [];
  return shuffle(poolFor(game, content, settings)).slice(0, ROUNDS).map((s) => s.id);
}

const asMatch = (data: unknown): Match | null => (data && (data as Match).id ? (data as Match) : null);

export async function findMatch(game: string, olderThan?: string): Promise<Match | null> {
  const { data, error } = await supabase.rpc('find_match', { game_id: game, older_than: olderThan ?? null });
  if (error) throw error;
  return asMatch(data);
}

export async function createMatch(game: string, sentenceIds: string[], opponent?: string): Promise<Match> {
  const { data, error } = await supabase
    .from('matches')
    .insert({ game, sentence_ids: sentenceIds, is_public: !opponent, player_b: opponent ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as Match;
}

export async function getMatch(id: string): Promise<Match | null> {
  const { data } = await supabase.from('matches').select('*').eq('id', id).maybeSingle();
  return asMatch(data);
}

export async function acceptMatch(id: string): Promise<Match> {
  const { data, error } = await supabase.rpc('accept_match', { match_id: id });
  if (error) throw error;
  return data as Match;
}

export async function cancelMatch(id: string) {
  await supabase.rpc('cancel_match', { match_id: id });
}

export async function submitResult(id: string, score: number, ms: number): Promise<Match> {
  const { data, error } = await supabase.rpc('submit_match_result', { match_id: id, score, ms });
  if (error) throw error;
  return data as Match;
}

/** Reports my progress after each answer; the server ends the match early once it's decided. */
export async function reportProgress(id: string, answered: number, score: number): Promise<Match | null> {
  const { data } = await supabase.rpc('report_match_progress', { match_id: id, answered, score });
  return asMatch(data);
}

/** Calls back whenever one of my matches changes (joins, challenges, results). */
export function watchMyMatches(me: string, onChange: (m: Match) => void): () => void {
  const channel = supabase
    .channel(`matches-${me}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `player_a=eq.${me}` }, (p) => onChange(p.new as Match))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `player_b=eq.${me}` }, (p) => onChange(p.new as Match))
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export interface ProgressEvent {
  round: number; // rounds answered
  score: number;
  results: boolean[];
  done: boolean;
  ms?: number;
}

export interface LiveChannel {
  send(e: ProgressEvent): void;
  close(): void;
}

/** Joins the match's live channel: broadcasts my progress and reports the opponent's. */
export function joinLive(
  matchId: string,
  me: string,
  handlers: { onProgress: (e: ProgressEvent) => void; onPresence: (opponentOnline: boolean) => void },
): LiveChannel {
  const channel: RealtimeChannel = supabase.channel(`match:${matchId}`, {
    config: { broadcast: { self: false }, presence: { key: me } },
  });
  let last: ProgressEvent | null = null;
  channel
    .on('broadcast', { event: 'progress' }, ({ payload }) => handlers.onProgress(payload as ProgressEvent))
    .on('presence', { event: 'sync' }, () => {
      const others = Object.keys(channel.presenceState()).filter((k) => k !== me);
      handlers.onPresence(others.length > 0);
    })
    .on('presence', { event: 'join' }, () => {
      // Re-send my latest progress so a (re)joining opponent catches up.
      if (last) channel.send({ type: 'broadcast', event: 'progress', payload: last });
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') channel.track({ at: Date.now() });
    });
  return {
    send(e) {
      last = e;
      channel.send({ type: 'broadcast', event: 'progress', payload: e });
    },
    close() {
      supabase.removeChannel(channel);
    },
  };
}
