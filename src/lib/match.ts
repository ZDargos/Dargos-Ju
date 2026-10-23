// Live head-to-head matches. Both players get the same sentences (stored on the match row) and
// race through them; progress is shared over a Supabase Realtime broadcast channel, and final
// scores are written through database functions so neither side can edit the other's result.

import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { shuffle } from './srs';
import { gameById, poolFor } from '../games/registry';
import { project, tilesFor, type LearnLang } from './learn';
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
  /** Each player's learning language; players in different modes can play each other. */
  lang_a: LearnLang;
  lang_b: LearnLang | null;
  /** Vocabulary games: both players draw words with this seed from these levels. */
  seed?: number | null;
  levels?: number[] | null;
  /** Options the creator picked, e.g. Speed round answers ('meaning' or 'sound'). */
  variant?: string | null;
  /** Word duel state (see private.duel_apply). */
  duel?: DuelState | null;
}

export interface DuelState {
  turn: number;
  mover: 'a' | 'b';
  phase: 'play' | 'steal';
  n: number;
  lives_a: number;
  lives_b: number;
  correct: number;
  deadline: string;
  last: { by: 'a' | 'b'; ok: boolean; n: number; typed: string; timeout: boolean; steal?: boolean } | null;
}

/** Sentences that suit the game in both languages, so an opponent in either mode can play them. */
export function pickSentences(gameId: string, content: Content, settings: Settings): string[] {
  const game = gameById(gameId);
  if (!game) return [];
  const english = new Set(poolFor(game, content, settings, 'en').map((s) => s.id));
  const both = poolFor(game, content, settings, 'zh').filter((s) => english.has(s.id));
  const pool = both.length >= ROUNDS ? both : poolFor(game, content, settings, settings.learning);
  return shuffle(pool).slice(0, ROUNDS).map((s) => s.id);
}

/** Word tiles a player had to handle across the match, in their language (for the tiebreak). */
function wordsHandled(m: Match, lang: LearnLang, content: Content): number {
  let n = 0;
  for (const id of m.sentence_ids) {
    const s = content.byId.get(id);
    if (s) n += tilesFor(project(s, lang), content).length;
  }
  return Math.max(1, n);
}

/**
 * Who won a finished match: more correct answers wins. On a tie the faster player wins; when the
 * players were learning different languages, speed is compared per word, since English sentences
 * usually have more word tiles than Chinese ones.
 */
export function decideWinner(m: Match, content: Content): 'a' | 'b' | 'tie' {
  const sa = m.score_a ?? 0;
  const sb = m.score_b ?? 0;
  if (sa !== sb) return sa > sb ? 'a' : 'b';
  // Speed rounds are timed and duels end on lives, so time never breaks a tie there.
  if (m.seed != null) return 'tie';
  const la = m.lang_a ?? 'zh';
  const lb = m.lang_b ?? la;
  let ta = m.time_a ?? 0;
  let tb = m.time_b ?? 0;
  if (la !== lb) {
    ta /= wordsHandled(m, la, content);
    tb /= wordsHandled(m, lb, content);
  }
  if (ta === tb) return 'tie';
  return ta < tb ? 'a' : 'b';
}

export const isMixedMatch = (m: Match) => !!m.lang_b && m.lang_a !== m.lang_b;

const asMatch = (data: unknown): Match | null => (data && (data as Match).id ? (data as Match) : null);

export async function findMatch(game: string, lang: LearnLang, olderThan?: string): Promise<Match | null> {
  const { data, error } = await supabase.rpc('find_match', { game_id: game, older_than: olderThan ?? null, my_lang: lang });
  if (error) throw error;
  return asMatch(data);
}

export async function createMatch(game: string, sentenceIds: string[], lang: LearnLang, opponent?: string, vocab?: { seed: number; levels: number[]; variant?: string; pool_size?: number }): Promise<Match> {
  const { data, error } = await supabase
    .from('matches')
    .insert({ game, sentence_ids: sentenceIds, is_public: !opponent, player_b: opponent ?? null, lang, lang_a: lang, ...(vocab ?? {}) })
    .select()
    .single();
  if (error) throw error;
  return data as Match;
}

export async function getMatch(id: string): Promise<Match | null> {
  const { data } = await supabase.from('matches').select('*').eq('id', id).maybeSingle();
  return asMatch(data);
}

export async function acceptMatch(id: string, lang: LearnLang): Promise<Match> {
  const { data, error } = await supabase.rpc('accept_match', { match_id: id, my_lang: lang });
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

export async function duelAnswer(id: string, turn: number, correct: boolean, typed: string): Promise<Match | null> {
  const { data, error } = await supabase.rpc('duel_answer', { match_id: id, turn, correct, typed });
  if (error) throw error;
  return asMatch(data);
}

export async function duelTimeout(id: string, turn: number): Promise<Match | null> {
  const { data } = await supabase.rpc('duel_timeout', { match_id: id, turn });
  return asMatch(data);
}

/** A wrong duel guess: takes 20% of the move's time off the clock (the player keeps trying). */
export async function duelWrong(id: string, turn: number): Promise<Match | null> {
  const { data, error } = await supabase.rpc('duel_wrong', { match_id: id, turn });
  if (error) throw error;
  return asMatch(data);
}

/** Ends a match whose opponent left without finishing (the server checks enough time has passed). */
export async function finishStaleMatch(id: string): Promise<Match | null> {
  const { data } = await supabase.rpc('finish_stale_match', { match_id: id });
  return asMatch(data);
}

/**
 * Backup for the live updates: while a match is running, re-reads it every few seconds and when the
 * app comes back to the front, so a missed update never leaves a player stuck waiting. Once I've
 * finished, it also asks the server to close the match if the opponent has left.
 */
export function useMatchRefresh(id: string, running: boolean, iFinished: boolean, onMatch: (m: Match) => void) {
  useEffect(() => {
    if (!running) return;
    const refresh = async () => {
      const m = iFinished ? (await finishStaleMatch(id)) ?? (await getMatch(id)) : await getMatch(id);
      if (m) onMatch(m);
    };
    const timer = setInterval(() => refresh().catch(() => undefined), 2500);
    const onVisible = () => document.visibilityState === 'visible' && refresh().catch(() => undefined);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id, running, iFinished]); // eslint-disable-line react-hooks/exhaustive-deps
}
