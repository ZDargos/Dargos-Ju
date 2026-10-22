// Profiles, friends and leaderboards. Other people only ever see your display name; your progress
// is shared only with friends who accepted a request (enforced in the database).

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { t } from '../i18n';

export const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export interface Profile {
  user_id: string;
  display_name: string;
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function getMyProfile(): Promise<Profile | null> {
  const me = await currentUserId();
  if (!me) return null;
  const { data } = await supabase.from('profiles').select('user_id, display_name').eq('user_id', me).maybeSingle();
  return data;
}

export async function saveDisplayName(name: string): Promise<void> {
  const me = await currentUserId();
  const display_name = name.trim();
  const { error } = await supabase.from('profiles').upsert({ user_id: me, display_name });
  if (error) throw new Error(error.code === '23505' ? t('That name is taken. Try another.') : error.message);
}

/** Your profile, loaded once per mount. `null` while loading, `false` if you haven't picked a name. */
export function useMyProfile() {
  const [profile, setProfile] = useState<Profile | null | false>(null);
  const reload = () => getMyProfile().then((p) => setProfile(p ?? false));
  useEffect(() => {
    reload();
  }, []);
  return { profile, reload };
}

/** Registered players by display name; an empty query lists everyone (A to Z). */
export async function searchProfiles(query: string): Promise<Profile[]> {
  const q = query.trim().replace(/[%_]/g, '');
  const me = await currentUserId();
  let req = supabase.from('profiles').select('user_id, display_name').neq('user_id', me ?? '').order('display_name').limit(q ? 20 : 100);
  if (q) req = req.ilike('display_name', `%${q}%`);
  const { data, error } = await req;
  if (error) throw error;
  return data ?? [];
}

export interface Friend {
  user_id: string;
  display_name: string;
  status: 'pending' | 'accepted';
  /** For pending: did I send it? */
  outgoing: boolean;
}

export async function listFriends(): Promise<Friend[]> {
  const me = await currentUserId();
  const { data, error } = await supabase.from('friendships').select('requester, addressee, status');
  if (error) throw error;
  const rows = data ?? [];
  const ids = rows.map((r) => (r.requester === me ? r.addressee : r.requester));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', ids);
    for (const p of profiles ?? []) names.set(p.user_id, p.display_name);
  }
  return rows.map((r) => {
    const other = r.requester === me ? r.addressee : r.requester;
    return { user_id: other, display_name: names.get(other) ?? t('Player'), status: r.status, outgoing: r.requester === me };
  });
}

export async function sendFriendRequest(userId: string): Promise<'sent' | 'accepted'> {
  const me = await currentUserId();
  // If they already asked me, accept theirs instead of creating a second request.
  const { data: reverse } = await supabase.from('friendships').select('status').eq('requester', userId).eq('addressee', me ?? '').maybeSingle();
  if (reverse) {
    await acceptFriend(userId);
    return 'accepted';
  }
  const { error } = await supabase.from('friendships').insert({ requester: me, addressee: userId });
  if (error && error.code !== '23505') throw error;
  return 'sent';
}

export async function acceptFriend(userId: string) {
  const me = await currentUserId();
  const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('requester', userId).eq('addressee', me ?? '');
  if (error) throw error;
}

export async function removeFriend(userId: string) {
  const me = await currentUserId();
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(`and(requester.eq.${me},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${me})`);
  if (error) throw error;
}

export type Period = 'day' | 'week' | 'all';

export interface LeaderRow {
  user_id: string;
  display_name: string;
  answers: number;
  is_me: boolean;
}

export async function leaderboard(period: Period): Promise<LeaderRow[]> {
  const { data, error } = await supabase.rpc('friend_leaderboard', { period, tz: timeZone() });
  if (error) throw error;
  return (data ?? []) as LeaderRow[];
}

export interface Summary {
  answers_day: number;
  answers_week: number;
  answers_total: number;
  right_rate_30d: number | null;
  cards_started: number;
  cards_known: number;
  last_review_at: string | null;
  active_days: string[];
}

export async function summary(userId: string): Promise<Summary> {
  const { data, error } = await supabase.rpc('friend_summary', { target: userId, tz: timeZone() });
  if (error) throw error;
  return data as Summary;
}

/** Consecutive days with study, ending today or yesterday, from YYYY-MM-DD dates (newest first). */
export function streakFromDays(days: string[]): number {
  const set = new Set(days);
  const d = new Date();
  const key = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (!set.has(key(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(key(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Total XP for a set of players (for level chips). Re-fetches when the set changes. */
export function useXpOf(userIds: string[]): Record<string, number> {
  const [xp, setXp] = useState<Record<string, number>>({});
  const key = [...new Set(userIds)].sort().join(',');
  useEffect(() => {
    if (!key) return;
    supabase
      .from('profiles')
      .select('user_id, xp')
      .in('user_id', key.split(','))
      .then(({ data }) => setXp(Object.fromEntries((data ?? []).map((p: { user_id: string; xp: number }) => [p.user_id, p.xp]))));
  }, [key]);
  return xp;
}
