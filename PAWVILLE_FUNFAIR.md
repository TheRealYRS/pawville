# Whiskerwick Funfair — Milestone 10, batch 5 (attractions complete)

A walled little theme park reached through the arch on the city boardwalk (`city-funfair-gate`), left again through
the park gate. Everything is free. Region id: `funfair` (a city district, always unlocked).

| Attraction | Where | How it works |
|---|---|---|
| Ferris wheel | west | Walk up, press **E**. Your seat comes round to the platform, you hop in, ride one slow turn, **Esc / Get off** leaves at the next stop. |
| Moonbeam Carousel | east | Same flow. Two turns, mounts bob. |
| Cloud Swing Ride | south-east | Only loads while slow. Spins up, chairs fly out, spins down; riders step off as soon as it slows. |
| Bumper Paws | south-west | **E** opens the arena. Arrow keys / WASD (or on-screen pad). Real collisions, 3 bots, 60 s, score = bumps you deal. |
| Ring Toss | north | **E** opens the booth. Mouse/touch aims, hold mouse or **Space** to charge, release to throw. 6 rings, 7 pegs (the golden peg slides). |
| Nutmeg | gate | Ticket-taker; talk for tips (friendship + memory flags work like every other resident). |

## Design rules that keep it robust
- Every moving part of a ride is a pure function of one shared UTC clock → both partners see the same wheel with nothing streamed.
- Only seat claims are shared (`{t:'fair', ride, seat, phase, at}` on the existing pair channel). Earlier claim wins; exact ties go to Tangerine;
  heartbeats every 2 s, a partner who goes quiet expires after 7 s (no ghost riders).
- A rider is carried by the seat every frame (the cat's position *is* the seat's position). Leaving the park, closing the page, a clock jump
  or a 45 s queue all end the session safely and put the cat on free ground.
- Bumper Paws / Ring Toss tokens are small, once per round, and always go through the existing arcade daily cap.

## Files
- `src/pawville/city/funfair.ts` ride model · `funfairRegion.ts` park layout · `bumperPaws.ts` · `ringToss.ts` · `funfairSound.ts`
- `src/pawville/adventure/useFunfair.tsx` rider controller · `components/FunfairGames.tsx` Bumper Paws + Ring Toss panels
- `src/pawville/render/funfairArt.ts` all attraction art · `styles/funfair.css`
- Tests: `tests/pawvilleFunfair.test.ts` (22 tests). Removed: the old single-ride `ferrisRide.ts`, `ferrisSession.ts`, `FerrisRideView.tsx`, `FunfairPanel.tsx`.
