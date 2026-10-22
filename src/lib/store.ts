// Local-first app state: card schedules, review history and settings live in IndexedDB on the
// device (so the app works offline) and are synced to Supabase in the background.

import { useSyncExternalStore } from 'react';
import { get, set } from 'idb-keyval';
import { DEFAULT_SETTINGS, type CardRecord, type ReviewLog, type Settings } from '../types';

export interface State {
  userId: string | null;
  loaded: boolean;
  cards: Record<string, CardRecord>;
  logs: ReviewLog[];
  settings: Settings;
  settingsUpdatedAt: string;
  dirtyCards: Record<string, true>;
  unsyncedLogs: Record<string, true>;
  settingsDirty: boolean;
  lastSyncAt: string | null;
  /** Server time up to which remote changes have been downloaded. */
  pulledThrough: string | null;
}

const initial: State = {
  userId: null,
  loaded: false,
  cards: {},
  logs: [],
  settings: DEFAULT_SETTINGS,
  settingsUpdatedAt: new Date(0).toISOString(),
  dirtyCards: {},
  unsyncedLogs: {},
  settingsDirty: false,
  lastSyncAt: null,
  pulledThrough: null,
};

let state: State = initial;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const storageKey = (userId: string) => `dj:state:${userId}`;

export const getState = () => state;

export function setState(update: Partial<State> | ((s: State) => Partial<State>)) {
  const patch = typeof update === 'function' ? update(state) : update;
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  if (state.userId) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }
}

async function persist() {
  if (!state.userId) return;
  const { loaded: _loaded, ...rest } = state;
  try {
    await set(storageKey(state.userId), rest);
  } catch (e) {
    console.warn('Could not save progress locally', e);
  }
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

export async function loadUser(userId: string) {
  let saved: Partial<State> | undefined;
  try {
    saved = await get(storageKey(userId));
  } catch {
    saved = undefined;
  }
  state = {
    ...initial,
    ...saved,
    settings: { ...DEFAULT_SETTINGS, ...saved?.settings, hints: { ...DEFAULT_SETTINGS.hints, ...saved?.settings?.hints } },
    userId,
    loaded: true,
  };
  listeners.forEach((l) => l());
}

export function clearUser() {
  clearTimeout(saveTimer);
  state = initial;
  listeners.forEach((l) => l());
}

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({
    settings: { ...s.settings, ...patch },
    settingsUpdatedAt: new Date().toISOString(),
    settingsDirty: true,
  }));
}

export const useSettings = () => useStore((s) => s.settings);
