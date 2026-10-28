# Pawville — current status

## Verified in this environment
- `node --test` (npm test): **279 / 279 pass** (home overhaul 13, Bumper Paws for two 18, residents 13 + engine regressions, funfair 22, …).
- `npm run audit:map`: 0 issues · `npm run audit:interactions`: every spot has a handler · `npm run verify:files`: all imports resolve.
- Real Chromium, the real source (small TS-transpiling dev server): the funfair; the new home (drag-to-decorate by mouse, touch and keyboard, undo, sheets, the cat climbing shelves/tree/perch, phone/tablet/short windows);
  **two real browser sessions playing Bumper Paws together** (invite, join, lobby, countdown, a full match, identical results, rematch, host leaves, guest vanishes);
  every previously empty region visited and its residents talked to. No console errors.

## NOT verified here (run locally)
- `npm run build` (Vite) and the strict `tsc --noEmit`: the package registry is blocked, so React/Vite types were unavailable.
  Type-checking was done with stand-in types; no real errors besides those caused by the missing React types.
- Two REAL devices (Bumper Paws and the funfair rides were tested with two sessions in one browser; the transport is the same pair channel Cat Boxing uses).
- Listening to the sound effects.

## Run
```
npm install
npm test
npm run build
npm run dev
