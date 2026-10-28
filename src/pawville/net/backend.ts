/**
 * Access to the EXISTING Paw vs Paw Supabase client and anonymous session.
 *
 * Pawville does not create its own authenticated client. It reuses the client exported by
 * src/lib/supabaseClient.ts and the session from src/lib/sessionService.ts (ensureSession), so
 * pair membership is tied to the same auth.uid() that owns your Paw vs Paw seats.
 *
 * The export name of the client could not be verified while building this milestone (the .ts
 * source was not readable from OneDrive), so it is resolved at runtime from the common names
 * below. If none is found, every backend feature reports "unavailable" — nothing is faked.
 */
import * as clientModule from '../../lib/supabaseClient';
import { ensureSession } from '../../lib/sessionService';
import { isSupabaseConfigured } from '../../lib/supabaseClient';

/** The subset of a Supabase client that Pawville uses. */
export interface SupabaseLike {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
  channel(topic: string, opts?: unknown): unknown;
  removeChannel(channel: unknown): Promise<unknown>;
  realtime?: { setAuth?: (token?: string) => unknown };
}

function looksLikeClient(x: unknown): x is SupabaseLike {
  return !!x && typeof x === 'object' && typeof (x as SupabaseLike).rpc === 'function' && typeof (x as SupabaseLike).channel === 'function';
}

let cached: SupabaseLike | null | undefined;

export function existingClient(): SupabaseLike | null {
  if (cached !== undefined) return cached;
  const mod = clientModule as unknown as Record<string, unknown>;
  const candidates: unknown[] = [mod.supabase, mod.client, mod.default];
  for (const name of ['getSupabase', 'getSupabaseClient', 'getClient']) {
    const fn = mod[name];
    if (typeof fn === 'function') {
      try {
        candidates.push((fn as () => unknown)());
      } catch {
        /* not configured */
      }
    }
  }
  cached = candidates.find(looksLikeClient) ?? null;
  return cached;
}

export type BackendStatus = 'not-configured' | 'client-missing' | 'ready';

export function backendStatus(): BackendStatus {
  if (!isSupabaseConfigured) return 'not-configured';
  return existingClient() ? 'ready' : 'client-missing';
}

/** Signs in (anonymously) with the existing Paw vs Paw session flow and returns the client. */
export async function readyClient(): Promise<SupabaseLike> {
  const status = backendStatus();
  if (status === 'not-configured') throw new Error('not_configured');
  const client = existingClient();
  if (!client) throw new Error('client_missing');
  await ensureSession();
  return client;
}
