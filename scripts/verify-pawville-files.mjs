#!/usr/bin/env node
// Run from the project root after copying the Pawville package over your project:  npm run verify:files
// Checks that (1) the original Paw vs Paw files exist, (2) every Pawville file exists and
// (3) every relative import in the Pawville code and the changed original files resolves.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const original = [
  'src/router.ts', 'src/vite-env.d.ts',
  ...['types', 'gameRules', 'matchEngine', 'minimaxAI', 'messages', 'animations'].map((f) => `src/game/${f}.ts`),
  ...['useOnlineRoom', 'useOfflineMatch', 'useGameFeedback', 'useToast'].map((f) => `src/hooks/${f}.ts`),
  ...['supabaseClient', 'sessionService', 'roomService', 'preferences', 'soundService', 'share'].map((f) => `src/lib/${f}.ts`),
  ...['CatCharacter', 'GameBoard', 'PlayerCard', 'GameHud', 'GameStatus', 'VictoryOverlay', 'ReactionBar', 'ReactionIcon', 'SoundToggle',
    'InvitePanel', 'MoveHistory', 'TopBar', 'Modal', 'Toast', 'Button', 'Logo', 'PawPrint', 'Starfield', 'HowToPlay', 'CustomizeModal', 'StateScreen',
  ].map((f) => `src/components/${f}.tsx`),
  'src/pages/NotFoundPage.tsx', 'src/styles/designTokens.css', 'src/styles/globalStyles.css', 'src/styles/components.css',
  'supabase/migrations/20261023000001_paw_vs_paw_core.sql', 'supabase/migrations/20261023000002_realtime_presence_auth.sql',
];
const pawville = ['supabase/migrations/20261024000001_pawville_pairs.sql', 'src/pawville/world/townMap.ts', 'src/pawville/couple/pairHub.ts', 'src/pawville/pages/TownPage.tsx'];
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
let problems = 0;
const missing = original.filter((f) => !existsSync(f));
problems += missing.length;
console.log(`${missing.length === 0 ? '✔' : '✖'} Original Paw vs Paw: ${original.length - missing.length}/${original.length} files present`);
for (const f of missing) console.log(`    missing: ${f}`);
const missingPv = pawville.filter((f) => !existsSync(f));
if (!existsSync('src/pawville') || missingPv.length) {
  console.log('✖ Pawville files are missing — copy the Pawville package into this folder.');
  for (const f of missingPv) console.log(`    missing: ${f}`);
  process.exit(1);
}
const files = walk('src/pawville').concat(['src/App.tsx', 'src/main.tsx', 'src/pages/HomePage.tsx', 'src/pages/GameRoomPage.tsx', 'src/pages/OfflineGamePage.tsx', 'src/components/CatCharacter.tsx']);
let unresolved = 0;
for (const f of files.filter((x) => /\.(ts|tsx)$/.test(x))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/from '(\.[^']+)'/g)) {
    const base = resolve(dirname(f), m[1]);
    const ok = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].some((p) => existsSync(p) && statSync(p).isFile());
    if (!ok) { unresolved++; console.log(`    unresolved import in ${f}: ${m[1]}`); }
  }
}
problems += unresolved;
console.log(`${unresolved === 0 ? '✔' : '✖'} Pawville: ${files.length} files, all relative imports resolve`);
if (existsSync('src/pawville/games/pawtype/passages.ts')) console.log('ℹ Old Milestone 2 file src/pawville/games/pawtype/passages.ts is no longer used — you may delete it.');
process.exitCode = problems === 0 ? 0 : 1;
