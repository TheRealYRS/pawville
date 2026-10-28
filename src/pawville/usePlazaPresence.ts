import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import type { TownIdentity } from './identity';
import { existingClient } from './net/backend.ts';
import { PROTOCOL_VERSION, type EmoteId, type PlayerSnapshot } from './net/presenceProtocol.ts';
import { presenceChannelFactory, startTownPresence, type PresenceStatus, type TownPresence } from './net/townPresence.ts';
import type { CatPose } from './render/catSprites.ts';
import { MAX_SCENE_SIZE } from './world/scene.ts';
import type { RegionId } from './adventure/state.ts';
import type { Vec2 } from './world/geometry.ts';
import type { SeatClaim } from './net/occupancy.ts';

export interface PlazaPresenceState {
  status: PresenceStatus;
  others: string[];
  ref: MutableRefObject<TownPresence | null>;
}

export interface SelfExtras {
  pose?: CatPose;
  lift?: number;
  emote?: EmoteId | null;
  /** ms since the current emote started (sent so remote clients play it from the same point). */
  emoteAge?: number;
  emoteSeq?: number;
  run?: boolean;
  pair?: string | null;
  region?: RegionId;
  /** The seat this cat holds (bench / ride seat), so every other player can see it is taken. */
  claim?: SeatClaim | null;
}

export function selfSnapshot(identity: TownIdentity, pos: Vec2, facing: PlayerSnapshot['facing'] = 'down', moving = false, extras: SelfExtras = {}): PlayerSnapshot {
  return {
    v: PROTOCOL_VERSION, id: identity.id, name: identity.name, cat: identity.cat, coat: identity.coat, accessory: identity.accessory, extra: identity.extra,
    x: pos.x, y: pos.y, facing, moving, pose: extras.pose ?? 'stand', lift: extras.lift ?? 0, emote: extras.emote ?? null,
    emoteAge: Math.max(0, Math.round(extras.emoteAge ?? 0)), emoteSeq: extras.emoteSeq ?? 0, run: extras.run ?? false, pair: extras.pair ?? null,
    region: extras.region ?? 'town',
    claim: extras.claim ?? null,
  };
}

/** Connects to the shared town channel when Supabase is configured; otherwise stays solo. */
export function usePlazaPresence(identity: TownIdentity, startPos: Vec2): PlazaPresenceState {
  const ref = useRef<TownPresence | null>(null);
  const [status, setStatus] = useState<PresenceStatus>(isSupabaseConfigured ? 'connecting' : 'disabled');
  const [others, setOthers] = useState<string[]>([]);
  const startRef = useRef(startPos);
  const idRef = useRef(identity);
  idRef.current = identity;

  useEffect(() => {
    const env = import.meta.env;
    const url = env.VITE_SUPABASE_URL as string | undefined;
    const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY) as string | undefined;
    if (!isSupabaseConfigured || !url || !key) {
      setStatus('disabled');
      return;
    }
    const presence = startTownPresence({
      self: selfSnapshot(idRef.current, startRef.current),
      world: MAX_SCENE_SIZE,
      factory: presenceChannelFactory(url, key, existingClient()),
      onStatus: (s) => setStatus(s),
      onRosterChange: (ids) => setOthers(ids),
    });
    ref.current = presence;
    return () => {
      ref.current = null;
      void presence.stop();
    };
  }, []);

  return { status, others, ref };
}
