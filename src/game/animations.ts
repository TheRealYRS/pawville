/** Animation timing + helpers. Durations are short so the game never feels sluggish. */
export const DURATION = {
  placement: 380,
  shake: 360,
  winReveal: 650, // let the winning line glow before the result card appears
  reactionFloat: 1800,
  roundBanner: 1400,
  restoredBanner: 2200,
  aiThinkMin: 380,
  aiThinkMax: 760,
} as const;

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Direction (-1..1, -1..1) from the center cell toward `cell`, used to make cats glance at the last move. */
export function lookToward(cell: number | null): { x: number; y: number } {
  if (cell === null) return { x: 0, y: 0 };
  return { x: (cell % 3) - 1, y: Math.floor(cell / 3) - 1 };
}

/** Restarts a CSS animation class on an element (used for the invalid-move shake). */
export function retrigger(el: HTMLElement | null, className: string): void {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth; // force reflow
  el.classList.add(className);
}
