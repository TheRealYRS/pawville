# Bumper Paws for two (Milestone 10b)

You and your partner drive two cars against two bots. Most points after 60 seconds wins; hard hits score more (1 / 2 / 3 points).

## How you play it
1. Walk up to the Bumper Paws arena in the funfair and press **E**. If your partner is online, the start screen offers **Drive with {partner}**.
2. Your partner gets an invitation anywhere in Pawville ("{you} invites you to drive bumper cars" → **Join**). Joining takes them to the funfair and opens the arena for them.
3. Both of you are marked ready; the host presses **Start**; a 3-2-1 countdown; drive (arrow keys / WASD, or the touch pad).
4. Results show both scores and who won. Each of you earns your own paw tokens (small, once per round, still capped by the daily arcade limit) and a **scrapbook memory** is saved for the round.
   The host can press **Rematch** (both are ready again automatically).

Tangerine always drives the orange car, Midnight the blue one; the partner's car carries their name tag and your own is marked YOU.

## How it works (so it can be trusted)
- It is a normal shared activity (`kind: 'bumper'`), so invite / ready / countdown / rematch / the 15-second disconnect grace all come from the existing, already-tested session code.
- **The host runs the match.** The guest sends its steering (`bump:in`, on every change and every 100 ms) and receives about 20 snapshots a second (`bump:st`, ~350 characters each), which it smooths and extrapolates ≤150 ms so cars glide.
- Everything arriving from the network is validated and clamped (`city/bumperNet.ts`): a broken or hostile message cannot move a car outside the arena, give it a crazy speed or crash the other game.
- A guest who stops sending (closed laptop) is treated as "hands off the wheel" after 600 ms.
- The final result is sent several times, so a lost message cannot leave the two screens disagreeing.

## When someone leaves
| What happens | Host sees | Guest sees |
|---|---|---|
| Guest leaves / closes the tab mid-match | after the 15 s grace: "{partner} left — the bots took their car", the round carries on solo | – |
| Host leaves mid-match | – | "{host} left, so the match ended." → OK → back to solo |
| Either leaves the lobby | "{partner} left, so the match ended." | same |
| Partner declines | "{partner} said not now." | – |

## Verified
- `tests/pawvilleBumperCouple.test.ts` (18 tests): two-driver physics and scoring, bots chase both humans, the speed limit and arena walls always hold, wire validation, smoothing, stale input, the whole session flow through the real reducer, and a **full 60-second match over a simulated lossy (20 %), laggy (90 ms) network** where both devices end with identical scores and the same verdict.
- **Two real browser sessions** (Tangerine and Midnight, paired with the project's demo transport): invite → join (panel opened by itself) → ready → Start → countdown → a 60 s match with both cars driven → both screens showed the same result ("Midnight wins! 0–3" / "You win! 3–0") → Rematch → both back in the lobby, ready → Leave. Also the host leaving mid-match, and the guest's tab vanishing mid-match.
- Solo Bumper Paws is unchanged (same physics, same rewards; the "Drive with …" option only appears when paired and the partner is online).

## Honest limits
- Tested with two sessions in one browser using the demo transport, **not** on two real devices over Supabase Realtime. The Supabase transport uses the same message API (the same one Cat Boxing already runs on).
- The match is host-authoritative (a friendly mode, like Cat Boxing — not anti-cheat). The host has zero input lag; the guest sees the world about one network round-trip behind.
- A speed limit is now enforced at the end of every physics step (a collision could briefly add speed beyond the limit). Solo play is unaffected in practice.
