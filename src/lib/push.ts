// Push notifications for the website and the iPhone home-screen app (Web Push).
// Each device subscribes separately; which notification types you get is a per-account setting.

import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { VAPID_PUBLIC_KEY } from '../config';
import { msg } from '../i18n/msg';

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

/** Notification types. Add new ones here and as a boolean column in notification_prefs. */
export const NOTIFICATION_TYPES = [{ key: 'challenges', label: msg('Challenges'), help: msg('When a friend challenges you to a game') }] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]['key'];
export type NotificationPrefs = { enabled: boolean } & Record<NotificationType, boolean>;

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;

const pushApis = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function pushState(): Promise<PushState> {
  if (Capacitor.isNativePlatform()) return 'unsupported';
  // iPhone only offers push to web apps added to the home screen.
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!pushApis()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const b64url = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';

/** Asks for permission (must be called from a tap) and registers this device. */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('./sw.js'));
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) as BufferSource }));
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    p256dh: b64url(sub.getKey('p256dh')),
    auth: b64url(sub.getKey('auth')),
    platform: isIos() ? 'ios-web' : 'web',
  });
  if (error) throw error;
  return 'on';
}

/** Stops notifications on this device only. */
export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  return 'off';
}

export async function getPrefs(): Promise<NotificationPrefs> {
  const { data } = await supabase.from('notification_prefs').select('enabled, challenges').maybeSingle();
  return data ?? { enabled: true, challenges: true };
}

export async function savePrefs(prefs: NotificationPrefs) {
  const { error } = await supabase.from('notification_prefs').upsert({ ...prefs, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Tells the server to notify the friend you just challenged (best effort). */
export function notifyChallenge(matchId: string) {
  supabase.functions.invoke('notify-challenge', { body: { match_id: matchId } }).catch(() => undefined);
}
