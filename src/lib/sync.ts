// Background sync between the local store and Supabase. Card schedules use last-write-wins on
// updated_at; review logs are append-only and deduplicated by id.

import { supabase } from './supabase';
import { getState, setState } from './store';
import type { CardRecord, Dir, Grade, ReviewMode, Settings, StoredCard } from '../types';

const PAGE = 1000;
let timer: ReturnType<typeof setTimeout> | undefined;
let pushing = false;

// Re-download a small overlap so rows committed slightly out of order are never missed.
const OVERLAP_MS = 2 * 60 * 1000;

async function fetchAll<T>(table: string, columns: string, since: string | null): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).order('synced_at').range(from, from + PAGE - 1);
    if (since) q = q.gt('synced_at', since);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

interface CardRow { card_key: string; card: StoredCard; updated_at: string; synced_at: string }
interface LogRow { id: string; sentence_id: string; direction: Dir; grade: Grade; mode: ReviewMode; reviewed_at: string; synced_at: string }

/** Downloads changes made on other devices since the last pull (everything on the first pull). */
export async function pullRemote() {
  const through = getState().pulledThrough;
  const since = through ? new Date(Date.parse(through) - OVERLAP_MS).toISOString() : null;
  const [cardRows, logRows, settingsRes] = await Promise.all([
    fetchAll<CardRow>('card_states', 'card_key, card, updated_at, synced_at', since),
    fetchAll<LogRow>('review_logs', 'id, sentence_id, direction, grade, mode, reviewed_at, synced_at', since),
    supabase.from('user_settings').select('settings, updated_at').maybeSingle(),
  ]);

  setState((s) => {
    const cards: Record<string, CardRecord> = { ...s.cards };
    const dirtyCards = { ...s.dirtyCards };
    for (const row of cardRows) {
      const local = cards[row.card_key];
      if (!local || Date.parse(row.updated_at) >= Date.parse(local.updatedAt)) {
        cards[row.card_key] = { card: row.card, updatedAt: row.updated_at };
        delete dirtyCards[row.card_key];
      }
    }

    const known = new Set(s.logs.map((l) => l.id));
    const unsyncedLogs = { ...s.unsyncedLogs };
    const logs = s.logs.slice();
    for (const r of logRows) {
      delete unsyncedLogs[r.id];
      if (known.has(r.id)) continue;
      logs.push({ id: r.id, sid: r.sentence_id, dir: r.direction, grade: r.grade, mode: r.mode, at: r.reviewed_at });
    }
    logs.sort((a, b) => a.at.localeCompare(b.at));

    let settings = s.settings;
    let settingsUpdatedAt = s.settingsUpdatedAt;
    const remote = settingsRes.data as { settings: Settings; updated_at: string } | null;
    if (remote && !s.settingsDirty && Date.parse(remote.updated_at) > Date.parse(s.settingsUpdatedAt)) {
      settings = { ...s.settings, ...remote.settings, hints: { ...s.settings.hints, ...remote.settings.hints } };
      settingsUpdatedAt = remote.updated_at;
    }
    let pulledThrough = s.pulledThrough;
    for (const r of [...cardRows, ...logRows]) if (!pulledThrough || r.synced_at > pulledThrough) pulledThrough = r.synced_at;
    return { cards, dirtyCards, logs, unsyncedLogs, settings, settingsUpdatedAt, pulledThrough, lastSyncAt: new Date().toISOString() };
  });
}

export async function pushPending() {
  if (pushing) return;
  pushing = true;
  try {
    const s = getState();
    const dirtyKeys = Object.keys(s.dirtyCards);
    for (let i = 0; i < dirtyKeys.length; i += 500) {
      const chunk = dirtyKeys.slice(i, i + 500);
      const snapshot = chunk.map((k) => ({ key: k, rec: s.cards[k] })).filter((x) => x.rec);
      const { error } = await supabase.from('card_states').upsert(
        snapshot.map(({ key, rec }) => ({ card_key: key, card: rec.card, updated_at: rec.updatedAt })),
      );
      if (error) throw error;
      setState((cur) => {
        const dirtyCards = { ...cur.dirtyCards };
        for (const { key, rec } of snapshot) if (cur.cards[key]?.updatedAt === rec.updatedAt) delete dirtyCards[key];
        return { dirtyCards };
      });
    }

    const pendingIds = new Set(Object.keys(s.unsyncedLogs));
    const pendingLogs = s.logs.filter((l) => pendingIds.has(l.id));
    for (let i = 0; i < pendingLogs.length; i += 500) {
      const chunk = pendingLogs.slice(i, i + 500);
      const { error } = await supabase.from('review_logs').upsert(
        chunk.map((l) => ({ id: l.id, sentence_id: l.sid, direction: l.dir, grade: l.grade, mode: l.mode, reviewed_at: l.at })),
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (error) throw error;
      setState((cur) => {
        const unsyncedLogs = { ...cur.unsyncedLogs };
        for (const l of chunk) delete unsyncedLogs[l.id];
        return { unsyncedLogs };
      });
    }

    if (s.settingsDirty) {
      const { error } = await supabase
        .from('user_settings')
        .upsert({ settings: s.settings, updated_at: s.settingsUpdatedAt });
      if (error) throw error;
      setState((cur) => ({ settingsDirty: cur.settingsUpdatedAt === s.settingsUpdatedAt ? false : cur.settingsDirty }));
    }
    setState({ lastSyncAt: new Date().toISOString() });
  } finally {
    pushing = false;
  }
}

/** Debounced push; failures are retried on the next change, when the device comes online, or every minute. */
export function scheduleSync(delay = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!getState().userId) return;
    pushPending().catch((e) => console.warn('Sync failed, will retry', e));
  }, delay);
}

export function startBackgroundSync() {
  const onOnline = () => scheduleSync(100);
  window.addEventListener('online', onOnline);
  const interval = setInterval(() => {
    const s = getState();
    if (Object.keys(s.dirtyCards).length || Object.keys(s.unsyncedLogs).length || s.settingsDirty) scheduleSync(0);
  }, 60_000);
  return () => {
    window.removeEventListener('online', onOnline);
    clearInterval(interval);
  };
}
