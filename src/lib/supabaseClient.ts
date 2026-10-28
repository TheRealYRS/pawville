import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Only PUBLIC browser keys belong here (the "publishable" key, or the legacy "anon" key).
 * Never put a secret / service_role key in a VITE_ variable: Vite inlines them into the bundle.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as
  | string
  | undefined;

function isSecretKey(k: string): boolean {
  if (k.startsWith('sb_secret_')) return true;
  if (k.startsWith('eyJ')) {
    // Legacy keys are JWTs: the role lives in the (base64url) payload.
    try {
      const payload = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string };
      return payload.role === 'service_role';
    } catch {
      return false;
    }
  }
  return false;
}

if (key && isSecretKey(key)) {
  // Fail loudly if someone pastes the wrong key: secret keys bypass Row Level Security.
  throw new Error('Refusing to start: a Supabase SECRET key was provided to the browser bundle.');
}

export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) throw new Error('not_configured');
  if (!client) {
    client = createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return client;
}
