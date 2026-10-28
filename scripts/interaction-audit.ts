/** Milestone 8.1: lists every interaction spot in every region and checks each one has a handler path in AdventureLayer.useSpot. */
import { readFileSync } from 'node:fs';
import { EXPLORE_REGIONS, regionDef, townSpots } from '../src/pawville/adventure/regions.ts';
const src = readFileSync(new URL('../src/pawville/adventure/AdventureLayer.tsx', import.meta.url), 'utf8');
const handledActivities = new Set([...src.matchAll(/s\.activity === '([a-z-]+)'/g)].map((m) => m[1]));
const roles = new Set([...src.matchAll(/case '([a-z]+)':/g)].map((m) => m[1]));
const all = [...townSpots().map((s) => ['town', s] as const), ...EXPLORE_REGIONS.flatMap((r) => regionDef(r).spots.map((s) => [r, s] as const))];
const counts: Record<string, number> = {};
const problems: string[] = [];
for (const [r, s] of all) {
  const k = s.role === 'activity' ? `activity:${s.activity}` : s.role;
  counts[k] = (counts[k] ?? 0) + 1;
  if (!roles.has(s.role)) problems.push(`${r}/${s.id}: role '${s.role}' has no handler`);
  if (s.role === 'activity' && !handledActivities.has(s.activity!) && !(s.activity === 'shop' && s.shop)) problems.push(`${r}/${s.id}: activity '${s.activity}' does nothing`);
  if (s.role === 'exit' && !s.to) problems.push(`${r}/${s.id}: exit without destination`);
  if (s.role === 'activity' && s.activity === 'machine' && !s.route && !s.machine) problems.push(`${r}/${s.id}: machine without a panel or game`);
  if ((s.role === 'sign' || s.role === 'use') && !s.text && !s.puzzle && !s.setFlags && !s.scene && !s.story && !s.cue) problems.push(`${r}/${s.id}: ${s.role} with no text, puzzle or effect`);
  if (s.role === 'collect' && !s.collect) problems.push(`${r}/${s.id}: collect without an item`);
}
console.log(`${all.length} interaction spots in ${EXPLORE_REGIONS.length + 1} regions`);
for (const [k, n] of Object.entries(counts).sort()) console.log(`  ${k.padEnd(22)} ${n}`);
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join('\n')}` : '\nevery spot has a working handler path');
process.exitCode = problems.length ? 1 : 0;
