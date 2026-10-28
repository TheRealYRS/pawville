/**
 * Cat Battleship rules (pure). 10×10 board, cells = row * 10 + col (A–J × 1–10).
 * Fleet 5/4/3/3/2. Turns strictly alternate. The opponent is only ever rendered through
 * `publicView`, which never contains afloat ship positions.
 */
import { randomInt, type Rng } from '../shared.ts';

export const SIZE = 10;
export const ROWS = 'ABCDEFGHIJ';

export type ShipId = 'galleon' | 'trawler' | 'barge' | 'sub' | 'dinghy';
export type Dir = 'h' | 'v';

export interface ShipSpec {
  id: ShipId;
  name: string;
  length: number;
}

export const FLEET: readonly ShipSpec[] = [
  { id: 'galleon', name: 'The Big Purr', length: 5 },
  { id: 'trawler', name: 'Tuna Trawler', length: 4 },
  { id: 'barge', name: 'Yarn Barge', length: 3 },
  { id: 'sub', name: 'Sardine Sub', length: 3 },
  { id: 'dinghy', name: 'Whisker Dinghy', length: 2 },
];

export interface Placement {
  ship: ShipId;
  row: number;
  col: number;
  dir: Dir;
}

export interface HiddenBoard {
  placements: readonly Placement[];
  shots: readonly number[];
}

export const cellIndex = (row: number, col: number) => row * SIZE + col;
export const cellLabel = (cell: number) => `${ROWS[Math.floor(cell / SIZE)]}${(cell % SIZE) + 1}`;

export function shipSpec(id: ShipId): ShipSpec {
  const s = FLEET.find((f) => f.id === id);
  if (!s) throw new Error(`Unknown ship ${id}`);
  return s;
}

export function placementCells(p: Placement): number[] | null {
  const len = shipSpec(p.ship).length;
  const cells: number[] = [];
  for (let i = 0; i < len; i++) {
    const r = p.row + (p.dir === 'v' ? i : 0);
    const c = p.col + (p.dir === 'h' ? i : 0);
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE || !Number.isInteger(r) || !Number.isInteger(c)) return null;
    cells.push(cellIndex(r, c));
  }
  return cells;
}

export type PlacementCheck = 'ok' | 'out_of_bounds' | 'overlap' | 'duplicate' | 'bad_direction';

export function checkPlacement(existing: readonly Placement[], p: Placement): PlacementCheck {
  if (p.dir !== 'h' && p.dir !== 'v') return 'bad_direction';
  if (existing.some((e) => e.ship === p.ship)) return 'duplicate';
  const cells = placementCells(p);
  if (!cells) return 'out_of_bounds';
  const taken = new Set(existing.flatMap((e) => placementCells(e) ?? []));
  return cells.some((c) => taken.has(c)) ? 'overlap' : 'ok';
}

export function isFleetComplete(placements: readonly Placement[]): boolean {
  if (placements.length !== FLEET.length) return false;
  const ok: Placement[] = [];
  for (const p of placements) {
    if (checkPlacement(ok, p) !== 'ok') return false;
    ok.push(p);
  }
  return FLEET.every((f) => placements.some((p) => p.ship === f.id));
}

export function randomFleet(rng: Rng): Placement[] {
  for (;;) {
    const placed: Placement[] = [];
    let failed = false;
    for (const spec of FLEET) {
      let done = false;
      for (let attempt = 0; attempt < 200 && !done; attempt++) {
        const p: Placement = { ship: spec.id, row: randomInt(rng, SIZE), col: randomInt(rng, SIZE), dir: rng() < 0.5 ? 'h' : 'v' };
        if (checkPlacement(placed, p) === 'ok') {
          placed.push(p);
          done = true;
        }
      }
      if (!done) failed = true;
    }
    if (!failed) return placed;
  }
}

export function createBoard(placements: readonly Placement[]): HiddenBoard {
  if (!isFleetComplete(placements)) throw new Error('Fleet is not complete and legal');
  return { placements: placements.map((p) => ({ ...p })), shots: [] };
}

export type ShotResult =
  | { kind: 'invalid' }
  | { kind: 'repeat' }
  | { kind: 'miss'; cell: number }
  | { kind: 'hit'; cell: number; ship: ShipId }
  | { kind: 'sunk'; cell: number; ship: ShipId };

function shipAt(board: HiddenBoard, cell: number): Placement | undefined {
  return board.placements.find((p) => (placementCells(p) ?? []).includes(cell));
}

export function isSunk(board: HiddenBoard, ship: ShipId): boolean {
  const p = board.placements.find((x) => x.ship === ship);
  if (!p) return false;
  const shots = new Set(board.shots);
  return (placementCells(p) ?? []).every((c) => shots.has(c));
}

export function fire(board: HiddenBoard, cell: number): { board: HiddenBoard; result: ShotResult } {
  if (!Number.isInteger(cell) || cell < 0 || cell >= SIZE * SIZE) return { board, result: { kind: 'invalid' } };
  if (board.shots.includes(cell)) return { board, result: { kind: 'repeat' } };
  const next: HiddenBoard = { placements: board.placements, shots: [...board.shots, cell] };
  const ship = shipAt(next, cell);
  if (!ship) return { board: next, result: { kind: 'miss', cell } };
  return { board: next, result: isSunk(next, ship.ship) ? { kind: 'sunk', cell, ship: ship.ship } : { kind: 'hit', cell, ship: ship.ship } };
}

export function allSunk(board: HiddenBoard): boolean {
  return FLEET.every((f) => isSunk(board, f.id));
}

export type CellView = 'unknown' | 'miss' | 'hit' | 'sunk';

export interface PublicView {
  cells: CellView[];
  sunk: { ship: ShipId; cells: number[] }[];
  afloat: ShipId[];
  shots: number;
  hits: number;
}

export function publicView(board: HiddenBoard): PublicView {
  const cells: CellView[] = new Array(SIZE * SIZE).fill('unknown');
  const sunk: PublicView['sunk'] = [];
  const afloat: ShipId[] = [];
  let hits = 0;
  for (const shot of board.shots) {
    const ship = shipAt(board, shot);
    cells[shot] = ship ? 'hit' : 'miss';
    if (ship) hits++;
  }
  for (const f of FLEET) {
    if (isSunk(board, f.id)) {
      const p = board.placements.find((x) => x.ship === f.id)!;
      const sc = placementCells(p) ?? [];
      for (const c of sc) cells[c] = 'sunk';
      sunk.push({ ship: f.id, cells: sc });
    } else {
      afloat.push(f.id);
    }
  }
  return { cells, sunk, afloat, shots: board.shots.length, hits };
}

export type AiLevel = 'easy' | 'medium' | 'hard';

function neighbours(cell: number): number[] {
  const r = Math.floor(cell / SIZE);
  const c = cell % SIZE;
  const out: number[] = [];
  if (r > 0) out.push(cell - SIZE);
  if (r < SIZE - 1) out.push(cell + SIZE);
  if (c > 0) out.push(cell - 1);
  if (c < SIZE - 1) out.push(cell + 1);
  return out;
}

function unknownCells(view: PublicView): number[] {
  const out: number[] = [];
  view.cells.forEach((v, i) => { if (v === 'unknown') out.push(i); });
  return out;
}

function targetCandidates(view: PublicView): number[] {
  const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < SIZE && c < SIZE;
  const isHit = (r: number, c: number) => inside(r, c) && view.cells[cellIndex(r, c)] === 'hit';
  const isUnknown = (r: number, c: number) => inside(r, c) && view.cells[cellIndex(r, c)] === 'unknown';
  const hits = view.cells.map((v, i) => (v === 'hit' ? i : -1)).filter((i) => i >= 0);
  if (hits.length === 0) return [];
  const line = new Set<number>();
  for (const h of hits) {
    const r = Math.floor(h / SIZE);
    const c = h % SIZE;
    for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
      if (!isHit(r + dr, c + dc)) continue;
      let a = 0;
      while (isHit(r - dr * (a + 1), c - dc * (a + 1))) a++;
      let b = 1;
      while (isHit(r + dr * (b + 1), c + dc * (b + 1))) b++;
      const ends: [number, number][] = [[r - dr * (a + 1), c - dc * (a + 1)], [r + dr * (b + 1), c + dc * (b + 1)]];
      for (const [er, ec] of ends) if (isUnknown(er, ec)) line.add(cellIndex(er, ec));
    }
  }
  if (line.size > 0) return [...line];
  return [...new Set(hits.flatMap(neighbours).filter((n) => view.cells[n] === 'unknown'))];
}

export function densityMap(view: PublicView): number[] {
  const score = new Array(SIZE * SIZE).fill(0);
  const blocked = (c: number) => view.cells[c] === 'miss' || view.cells[c] === 'sunk';
  for (const id of view.afloat) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        for (const dir of ['h', 'v'] as const) {
          const cells = placementCells({ ship: id, row: r, col: c, dir });
          if (!cells || cells.some(blocked)) continue;
          const covered = cells.filter((x) => view.cells[x] === 'hit').length;
          const weight = 1 + covered * 20;
          for (const x of cells) if (view.cells[x] === 'unknown') score[x] += weight;
        }
      }
    }
  }
  return score;
}

export function chooseShot(view: PublicView, level: AiLevel, rng: Rng): number {
  const unknown = unknownCells(view);
  if (unknown.length === 0) return -1;
  const pick = (list: number[]) => list[randomInt(rng, list.length)];
  if (level === 'easy') return pick(unknown);
  if (level === 'medium') {
    const t = targetCandidates(view);
    return t.length > 0 ? pick(t) : pick(unknown);
  }
  const density = densityMap(view);
  const hasHits = view.cells.some((v) => v === 'hit');
  const pool = hasHits ? unknown : unknown.filter((c) => (Math.floor(c / SIZE) + (c % SIZE)) % 2 === 0);
  const candidates = pool.length > 0 ? pool : unknown;
  let best = -1;
  let bestCells: number[] = [];
  for (const c of candidates) {
    if (density[c] > best) {
      best = density[c];
      bestCells = [c];
    } else if (density[c] === best) {
      bestCells.push(c);
    }
  }
  return pick(bestCells);
}
