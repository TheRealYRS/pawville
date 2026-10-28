/** Milestone 8.1: pure layout rule shared by PanelSheet's CSS and the tests — inner padding must clear the rounded corner. */
export function sheetPadding(radius: number): number {
  // a corner of radius r eats ~0.3r horizontally at the first text baseline; keep a 10px margin (14px floor)
  return Math.max(14, Math.ceil(radius * 0.3) + 10);
}
