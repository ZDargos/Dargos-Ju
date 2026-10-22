import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { SUPABASE_URL } from '../config';
import { clearUser, loadUser } from './store';
import { pullRemote, pushPending } from './sync';
import { loadRemoteContent } from './content';

export interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in';
  session: Session | null;
  isAdmin: boolean;
}

/**
 * The session saved on this device, even if its access token has expired. Used offline: Supabase
 * can't refresh an expired token without a connection and would otherwise report "signed out".
 */
function storedSession(): Session | null {
  try {
    const key = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    const raw = localStorage.getItem(key);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    return s?.user?.id ? s : null;
  } catch {
    return null;
  }
}

async function checkAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase.from('app_admins').select('user_id').eq('user_id', userId).maybeSingle();
  return !!data;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null, isAdmin: false });

  useEffect(() => {
    // Development-only demo mode for testing the UI without an account: localStorage dj:demo = 1.
    if (import.meta.env.DEV && localStorage.getItem('dj:demo') === '1') {
      loadUser('demo').then(() => setState({ status: 'signed-in', session: { user: { id: 'demo', email: 'demo@localhost' } } as Session, isAdmin: true }));
      return;
    }
    let currentUser: string | null = null;
    const apply = async (session: Session | null) => {
      if (!session) {
        currentUser = null;
        clearUser();
        setState({ status: 'signed-out', session: null, isAdmin: false });
        return;
      }
      if (currentUser === session.user.id) {
        setState((s) => ({ ...s, session }));
        return;
      }
      currentUser = session.user.id;
      await loadUser(session.user.id);
      setState({ status: 'signed-in', session, isAdmin: false });
      // Network work happens after the local data is on screen, so the app opens offline too.
      pullRemote()
        .then(() => pushPending())
        .catch((e) => console.warn('Initial sync failed', e));
      loadRemoteContent().catch((e) => console.warn('Could not load added sentences', e));
      checkAdmin(session.user.id)
        .then((isAdmin) => setState((s) => ({ ...s, isAdmin })))
        .catch(() => undefined);
    };
    supabase.auth.getSession().then(({ data, error }) => apply(data.session ?? (error && (error.name === 'AuthRetryableFetchError' || !navigator.onLine) ? storedSession() : null)));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Offline token refreshes fail without signing out; keep studying with the saved session.
      if (!session && event !== 'SIGNED_OUT' && currentUser) return;
      // Defer so Supabase's internal lock is released before we query.
      setTimeout(() => apply(session), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return state;
}

export function friendlyAuthError(message: string): string {
  if (/BLOCKED/i.test(message)) return 'This email has been blocked.';
  if (/INVITE_ONLY|Database error saving new user/i.test(message)) return "This email hasn't been invited yet. Ask the admin to add it.";
  if (/banned/i.test(message)) return 'This account has been blocked.';
  if (/Invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/Email not confirmed/i.test(message)) return 'Please confirm your email first, using the link we sent you.';
  if (/Password should be/i.test(message)) return 'Password must be at least 6 characters.';
  return message;
}

export async function signOut() {
  try {
    await pushPending();
  } catch {
    /* offline: unsynced progress stays on this device */
  }
  await supabase.auth.signOut();
}
