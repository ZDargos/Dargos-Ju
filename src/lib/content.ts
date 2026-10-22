// Sentence content: levels built from data/sentences/*.csv at build time, plus sentences the
// admin added in the app (custom_sentences) and manual word-split fixes (segment_overrides).

import { useSyncExternalStore } from 'react';
import { get, set } from 'idb-keyval';
import built from '../generated/sentences.json';
import { supabase } from './supabase';
import { wordsOf } from './segmenter';
import type { LexEntry, Level, Sentence } from '../types';

interface Remote {
  custom: { id: string; level: number; zh: string; en: string; tokens: string[]; lex: Record<string, LexEntry> }[];
  overrides: { sentence_id: string; tokens: string[]; lex: Record<string, LexEntry> }[];
}

export interface Content {
  sentences: Sentence[];
  byId: Map<string, Sentence>;
  levels: Level[];
  lexicon: Record<string, LexEntry>;
  /** Word → ids of sentences containing it. */
  wordIndex: Map<string, string[]>;
}

const CACHE_KEY = 'dj:content';
const listeners = new Set<() => void>();
let remote: Remote = { custom: [], overrides: [] };
let content = assemble(remote);

function assemble(r: Remote): Content {
  const lexicon: Record<string, LexEntry> = { ...(built.lexicon as Record<string, LexEntry>) };
  const overrides = new Map(r.overrides.map((o) => [o.sentence_id, o]));
  const sentences: Sentence[] = [];
  for (const s of built.sentences as Sentence[]) {
    const o = overrides.get(s.id);
    sentences.push(o ? { ...s, tokens: o.tokens } : s);
    if (o) Object.assign(lexicon, o.lex);
  }
  for (const c of r.custom) {
    const o = overrides.get(c.id);
    sentences.push({ id: c.id, level: c.level, zh: c.zh, en: c.en, tokens: o?.tokens ?? c.tokens, custom: true });
    Object.assign(lexicon, c.lex, o?.lex);
  }

  const levelMap = new Map<number, Level>();
  for (const s of sentences) {
    const l = levelMap.get(s.level) ?? { level: s.level, name: `Level ${s.level}`, count: 0 };
    l.count++;
    levelMap.set(s.level, l);
  }
  const levels = [...levelMap.values()].sort((a, b) => a.level - b.level);

  const wordIndex = new Map<string, string[]>();
  for (const s of sentences) {
    for (const w of new Set(wordsOf(s.tokens))) {
      const list = wordIndex.get(w);
      if (list) list.push(s.id);
      else wordIndex.set(w, [s.id]);
    }
  }
  return { sentences, byId: new Map(sentences.map((s) => [s.id, s])), levels, lexicon, wordIndex };
}

function publish(r: Remote) {
  remote = r;
  content = assemble(r);
  listeners.forEach((l) => l());
}

export const getContent = () => content;

export function useContent(): Content {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => content,
  );
}

/** Loads cached remote content immediately, then refreshes it from Supabase. */
export async function loadRemoteContent() {
  try {
    const cached = (await get(CACHE_KEY)) as Remote | undefined;
    if (cached) publish(cached);
  } catch {
    /* no cache */
  }
  await refreshRemoteContent();
}

export async function refreshRemoteContent() {
  const [c, o] = await Promise.all([
    supabase.from('custom_sentences').select('id, level, zh, en, tokens, lex').order('created_at'),
    supabase.from('segment_overrides').select('sentence_id, tokens, lex'),
  ]);
  if (c.error || o.error) throw c.error ?? o.error;
  const next: Remote = { custom: c.data ?? [], overrides: o.data ?? [] };
  publish(next);
  set(CACHE_KEY, next).catch(() => undefined);
}

export const builtInSentenceIds = new Set((built.sentences as Sentence[]).map((s) => s.id));
export const getRemote = () => remote;
