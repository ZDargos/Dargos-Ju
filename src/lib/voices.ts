// Native-speaker recordings ("Lend your voice"). People record sentences in a language they speak
// natively; while a recording stands it plays instead of the neural audio. Listeners vote it good
// or bad, and the server trashes it once enough votes are bad (thresholds in app_config, editable
// on the admin page). A trashed recording's sentence goes back into the pool needing a voice.
//
// Tables: voice_recordings, voice_votes; files in the public "voices" storage bucket under <uid>/.

import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { SUPABASE_URL } from '../config';
import { audioKey } from './audioKey';
import type { LearnLang } from './learn';
import type { Content } from './content';
import type { Sentence } from '../types';

export interface VoiceRecording {
  id: string;
  user_id: string;
  lang: LearnLang;
  sentence_id: string;
  text_key: string;
  storage_path: string;
  up_votes: number;
  down_votes: number;
  created_at: string;
}

interface VoiceState {
  /** Live recordings by text key (audioKey of the exact sentence text). */
  byKey: Map<string, VoiceRecording>;
  /** Recordings this person has already voted on. */
  voted: Set<string>;
  loadedAt: number | null;
}

const CACHE_KEY = 'dj:voices';
let state: VoiceState = { byKey: new Map(), voted: new Set(), loadedAt: null };
const listeners = new Set<() => void>();

function set(next: Partial<VoiceState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ recordings: [...state.byKey.values()], voted: [...state.voted], loadedAt: state.loadedAt }));
  } catch {
    /* storage blocked: the list is fetched again next time */
  }
}

// Start from the last list seen, so recordings play offline too.
try {
  const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
  if (cached) state = { byKey: new Map(cached.recordings.map((r: VoiceRecording) => [r.text_key, r])), voted: new Set(cached.voted), loadedAt: cached.loadedAt };
} catch {
  /* no cache */
}

export function useVoices(): VoiceState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Downloads the current list of live recordings and this person's votes. */
export async function loadVoices(): Promise<void> {
  const [recs, votes] = await Promise.all([
    supabase.from('voice_recordings').select('id, user_id, lang, sentence_id, text_key, storage_path, up_votes, down_votes, created_at').eq('status', 'live'),
    supabase.from('voice_votes').select('recording_id'),
  ]);
  if (recs.error) throw recs.error;
  set({
    byKey: new Map((recs.data as VoiceRecording[]).map((r) => [r.text_key, r])),
    voted: new Set((votes.data ?? []).map((v: { recording_id: string }) => v.recording_id)),
    loadedAt: Date.now(),
  });
}

/** The text the app speaks for a sentence in a language (and so the text a recording must match). */
export const spokenText = (s: Sentence, lang: LearnLang) => (lang === 'zh' ? s.zh : s.enClean);

export const recordingFor = (text: string, lang: LearnLang): VoiceRecording | undefined => state.byKey.get(audioKey(lang, text));

export const publicVoiceUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/voices/${path}`;

const FILE_CACHE = 'dargos-ju-voices';

/** A playable URL for a recording, kept in the browser cache after the first play so it works offline. */
export async function recordingUrl(rec: VoiceRecording): Promise<string> {
  const url = publicVoiceUrl(rec.storage_path);
  if (typeof caches === 'undefined') return url;
  try {
    const cache = await caches.open(FILE_CACHE);
    let res = await cache.match(url);
    if (!res) {
      res = await fetch(url);
      if (!res.ok) throw new Error(`Recording ${res.status}`);
      await cache.put(url, res.clone());
    }
    return URL.createObjectURL(await res.blob());
  } catch {
    return url;
  }
}

/** Sentences in this language that don't have a standing recording yet. Includes new levels automatically. */
export function sentencesNeedingVoice(content: Content, lang: LearnLang): Sentence[] {
  return content.sentences.filter((s) => !state.byKey.has(audioKey(lang, spokenText(s, lang))));
}

/** How many sentences have a standing recording, per language. */
export function voiceProgress(content: Content, lang: LearnLang): { done: number; total: number } {
  const keys = new Set(content.sentences.map((s) => audioKey(lang, spokenText(s, lang))));
  let done = 0;
  for (const r of state.byKey.values()) if (r.lang === lang && keys.has(r.text_key)) done++;
  return { done, total: keys.size };
}

function extensionFor(mime: string): string {
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg')) return 'mp3';
  return 'webm';
}

/** Uploads a recording and registers it. Throws ALREADY_RECORDED if someone just recorded this sentence. */
export async function submitRecording(s: Sentence, lang: LearnLang, blob: Blob, durationMs: number): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  const uid = user.user?.id;
  if (!uid) throw new Error('Not signed in');
  const text = spokenText(s, lang);
  const key = audioKey(lang, text);
  const mime = (blob.type || 'audio/webm').split(';')[0];
  const path = `${uid}/${lang}/${key}-${Date.now()}.${extensionFor(mime)}`;
  const up = await supabase.storage.from('voices').upload(path, blob, { contentType: mime, upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.rpc('submit_voice_recording', {
    p_lang: lang,
    p_sentence_id: s.id,
    p_text_key: key,
    p_text: text,
    p_path: path,
    p_mime: mime,
    p_duration_ms: Math.round(durationMs),
  });
  if (error) {
    await supabase.storage.from('voices').remove([path]);
    throw new Error(error.message);
  }
  await loadVoices().catch(() => undefined);
}

/** Votes on a recording. Returns true if the vote trashed it. */
export async function voteRecording(rec: VoiceRecording, good: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('vote_voice_recording', { p_recording: rec.id, p_good: good });
  if (error) throw new Error(error.message);
  const row = (data as { status: string }[])[0];
  const voted = new Set(state.voted).add(rec.id);
  if (row?.status === 'trashed') {
    const byKey = new Map(state.byKey);
    byKey.delete(rec.text_key);
    set({ byKey, voted });
    supabase.functions.invoke('voice-cleanup').catch(() => undefined);
    return true;
  }
  set({ voted });
  return false;
}

export interface VoiceLeader {
  user_id: string;
  display_name: string;
  recordings: number;
  zh: number;
  en: number;
}

export async function voiceLeaderboard(): Promise<VoiceLeader[]> {
  const { data, error } = await supabase.rpc('voice_leaderboard');
  if (error) throw error;
  return (data as VoiceLeader[]).map((r) => ({ ...r, recordings: Number(r.recordings), zh: Number(r.zh), en: Number(r.en) }));
}

const names = new Map<string, string>();

/** A contributor's display name (cached). */
export async function contributorName(userId: string): Promise<string> {
  if (names.has(userId)) return names.get(userId)!;
  const { data } = await supabase.from('profiles').select('display_name').eq('user_id', userId).maybeSingle();
  const name = data?.display_name ?? '';
  names.set(userId, name);
  return name;
}
