/** Milestone 8.1: synchronous one-time claim guard (repeated input can't duplicate a reward before state re-renders). */
export function claimOnce(claimed: Set<string>, id: string): boolean {
  if (claimed.has(id)) return false;
  claimed.add(id);
  return true;
}
