import { getSupabase } from './supabaseClient';

let pending: Promise<string> | null = null;

/**
 * Returns the current anonymous user id, signing in anonymously on first use.
 * The session (a signed JWT) is stored by supabase-js, so a page refresh or a
 * second tab in the same browser resumes the same identity and therefore the same seat.
 */
export function ensureSession(): Promise<string> {
  if (pending) return pending;
  pending = (async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error('auth_failed');
    let session = data.session;
    if (!session) {
      const res = await supabase.auth.signInAnonymously();
      if (res.error || !res.data.session) {
        const msg = res.error?.message ?? '';
        throw new Error(/anonymous/i.test(msg) ? 'anonymous_disabled' : 'auth_failed');
      }
      session = res.data.session;
    }
    // Make sure Realtime (incl. private channels) uses this user's token.
    try {
      await supabase.realtime.setAuth(session.access_token);
    } catch {
      /* older clients set this automatically */
    }
    return session.user.id;
  })();
  pending.catch(() => { pending = null; });
  return pending;
}
