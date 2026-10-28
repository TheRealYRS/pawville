/**
 * Player INSTANCE id: one per page load (see identity.ts for why it is no longer stored in
 * sessionStorage — duplicated tabs copied it and two tabs became the same cat).
 */
const LEGACY_KEY = 'pawville:presence-id';
let instanceId: string | null = null;

export function presenceId(): string {
  if (instanceId) return instanceId;
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  instanceId = `cat_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  try {
    window.sessionStorage?.removeItem(LEGACY_KEY); // stop it being copied into duplicated tabs
  } catch {
    /* storage disabled */
  }
  return instanceId;
}

/** For tests only. */
export function resetInstanceIdForTests(id: string | null = null): void {
  instanceId = id;
}

/** "Tangerine ·3f" — default display name that still distinguishes two un-named cats. */
export function defaultName(cat: 'T' | 'M', id: string): string {
  return `${cat === 'T' ? 'Tangerine' : 'Midnight'} ·${id.slice(-2)}`;
}
