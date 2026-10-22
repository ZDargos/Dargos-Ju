import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { clearUser, loadUser } from './store';
import { pullRemote, pushPending } from './sync';
import { loadRemoteContent } from './content';

export interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in';
  session: Session | null;
  isAdmin: boolean;
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
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
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
