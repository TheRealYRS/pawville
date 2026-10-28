/**
 * One app-wide couple connection (module singleton + React hook), so the town and every game
 * share the SAME transport and activity session — no duplicate channels when screens change.
 *
 * Milestone 5: all logic lives in pairController.ts (dependency-injected and tested end-to-end);
 * this file wires it to the real Supabase client, storage and timers, and keeps the public API.
 */
import { useSyncExternalStore } from 'react';
import { backendStatus, readyClient } from '../net/backend.ts';
import type { Event } from './activitySession.ts';
import { PairController, type PairState } from './pairController.ts';
import { demoPairStore, otherRole, pairCacheStore, type Role } from './pairModel.ts';
import * as svc from './pairService.ts';
import { DemoPairTransport, SupabasePairTransport, type BroadcastLike, type PairMessage } from './transport.ts';

export type PairHubState = PairState;

const DEMO_ROLE_KEY = 'pawville:demo-role:';

const controller = new PairController({
  backend: backendStatus,
  svc,
  makeTransport: (p) => (p.source === 'demo'
    ? new DemoPairTransport(p.myRole, p.pairId.replace(/^demo:/, ''), (name) => new BroadcastChannel(name) as unknown as BroadcastLike)
    : new SupabasePairTransport(p.myRole, p.pairId, readyClient)),
  pairCache: pairCacheStore(),
  demoPair: demoPairStore(),
  demoRoles: {
    get: (code) => {
      try {
        const v = window.localStorage.getItem(DEMO_ROLE_KEY + code);
        return v === 'T' || v === 'M' ? v : null;
      } catch {
        return null;
      }
    },
    set: (code, role) => {
      try {
        window.localStorage.setItem(DEMO_ROLE_KEY + code, role);
      } catch {
        /* storage disabled: the demo can't be joined from another tab */
      }
    },
  },
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  errorCode: (e) => (e instanceof svc.PairError ? e.code : 'network'),
});

let wired = false;
function wireBrowserEvents() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  // Recover authoritative state after sleep, network changes or a tab coming back.
  const again = () => void controller.requestReconcile();
  window.addEventListener('online', again);
  window.addEventListener('focus', again);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') again(); });
}

export async function initPairHub(): Promise<void> {
  wireBrowserEvents();
  await controller.init();
}
export const refreshPair = () => controller.requestReconcile();
export const dispatch = (e: Event) => controller.dispatch(e);
export const sendPair = (msg: { t: string; [k: string]: unknown }) => controller.send(msg);
export const onPairMessage = (cb: (m: PairMessage) => void) => controller.onMessage(cb);
export const createInvite = (role: Role, name: string) => controller.createInvite(role, name);
export const acceptInvite = (code: string, name: string) => controller.acceptInvite(code, name);
export const declineInvite = (code: string) => controller.declineInvite(code);
export const cancelInvite = () => controller.cancelInvite();
export const leavePair = () => controller.leavePair();
export const createDemoPair = (role: Role) => controller.createDemoPair(role);
/** The joiner's role is taken from the creator's record (the role picker is ignored). */
export const joinDemoPair = (code: string, _role?: Role) => controller.joinDemoPair(code);
export const clearPairError = () => controller.clearError();
export const partnerRole = (): Role => otherRole(controller.myRole());

export function usePairHub(): PairHubState {
  return useSyncExternalStore((cb) => controller.subscribe(cb), () => controller.state, () => controller.state);
}
