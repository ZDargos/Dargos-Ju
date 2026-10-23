// "My words": words people add for themselves, studied and played alongside the built-in word list.
// Private per account (table user_words), cached on the device for offline use.

import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { getState } from './store';
import type { LearnLang } from './learn';
import { WORD_PREFIX, type VocabItem } from './vocab';
import { englishLexFor } from './browserSegmenter';

export interface MyWord {
  lang: LearnLang;
  text: string;
  py: string;
  gloss: string;
  created_at: string;
}

/** "My words" use level 0, so they sort before every real level. */
export const MY_WORDS_LEVEL = 0;

let words: MyWord[] = [];
let owner: string | null = null;
const listeners = new Set<() => void>();
const key = (uid: string) => `dj:my-words:${uid}`;

function current(): MyWord[] {
  const uid = getState().userId;
  if (uid !== owner) {
    owner = uid;
    words = [];
    try {
      if (uid) words = JSON.parse(localStorage.getItem(key(uid)) ?? '[]');
    } catch {
      /* no cache */
    }
  }
  return words;
}

function set(next: MyWord[]) {
  words = next;
  try {
    if (owner) localStorage.setItem(key(owner), JSON.stringify(next));
  } catch {
    /* kept in memory */
  }
  listeners.forEach((l) => l());
}

export function useMyWords(): MyWord[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
  );
}

export async function loadMyWords(): Promise<void> {
  current();
  const { data, error } = await supabase.from('user_words').select('lang, text, py, gloss, created_at').order('created_at');
  if (error) throw error;
  set(data as MyWord[]);
}

export async function addMyWord(w: Omit<MyWord, 'created_at'>): Promise<void> {
  const uid = getState().userId;
  const row = { ...w, text: w.text.trim(), py: w.py.trim(), gloss: w.gloss.trim() };
  const { error } = await supabase.from('user_words').insert({ ...row, user_id: uid });
  if (error) throw new Error(error.code === '23505' ? 'ALREADY_ADDED' : error.message);
  set([...current(), { ...row, created_at: new Date().toISOString() }]);
}

export async function removeMyWord(lang: LearnLang, text: string): Promise<void> {
  const { error } = await supabase.from('user_words').delete().eq('lang', lang).eq('text', text);
  if (error) throw error;
  set(current().filter((w) => !(w.lang === lang && w.text === text)));
}

/** My words for a language as study items. */
export function myVocab(lang: LearnLang): VocabItem[] {
  return current()
    .filter((w) => w.lang === lang)
    .map((w) => ({
      id: WORD_PREFIX + w.text,
      text: w.text,
      lang,
      level: MY_WORDS_LEVEL,
      py: w.py,
      gloss: w.gloss,
      isWord: true,
      isChar: lang === 'zh' && [...w.text].length === 1,
    }));
}

let cedict: Promise<Record<string, [string, string]>> | null = null;

/** Pronunciation and meaning for a word someone wants to add, from the built-in dictionaries. */
export async function lookupWord(lang: LearnLang, text: string): Promise<{ py: string; gloss: string } | null> {
  const w = text.trim();
  if (lang === 'zh') {
    cedict ??= fetch('./dict/cedict-lite.json').then((r) => {
      if (!r.ok) throw new Error('Could not load the dictionary');
      return r.json();
    });
    cedict.catch(() => (cedict = null));
    const e = (await cedict)[w];
    return e ? { py: e[0], gloss: e[1] } : null;
  }
  const e = (await englishLexFor([w]))[w.toLowerCase()];
  return e ? { py: e.py, gloss: e.en } : null;
}
