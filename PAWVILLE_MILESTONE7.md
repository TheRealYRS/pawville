# Pawville — Milestone 7: Whiskerwick City, arcade, voices, branching dialogue

Pawville (the village) is still home. Whiskerwick is a new city region reached by train from **Pawville Station** (the building that used to be the Typing Arena).

## What's in this milestone

- **Whiskerwick City** — six districts:
  - Station, with a ticket machine, a vending machine and the tram.
  - Central Plaza, with a fountain where you can make one wish a day for 1 token.
  - Shopping Street, with four shops.
  - Entertainment District: the Arcade (walk-in), the Bijou cinema and a photo booth.
  - Café Quarter: The Purring Cup and an ice-cream cart.
  - The Boardwalk: the Ferris wheel, a telescope and a fishing pier.
  - Benches you can sit on, and a noticeboard.
- **Whiskerwick Arcade (walk-in)** — its cabinets launch the existing games (no game was rebuilt):
  - PawType
  - Paw vs Paw
  - Whack-a-Cat
  - Paw Pairs (this is the existing Memory Paws game)
  - Cat Boxing

  It also has new **Meow Melody** and **claw machine** games, a vending machine and a high-score board.
- **Paw tokens** — a relaxed currency:
  - Earned by selling your finds at the Corner Market, from Clementine's one-time welcome gift, and from arcade play (capped at 15 a day).
  - Spent in shops, at the claw machine, on vending machines and on fountain wishes.
  - The total can't go negative.
- **City residents:** Clementine, Biscuit, Rosie, Mr. Pemberton and Ozzie.
  - Each has a daily routine. For example, Biscuit moves under the café awning when it rains or after dark, and Rosie has tea at the café in the evening.
  - **Branching dialogue:** when the conversation ends you pick a reply, and each reply has a tone. The game remembers your choices, and friendship grows from them.
  - They don't repeat their introductions, and they react to the harbor, Lumi and your quests.
- **New quest: Biscuit's Unfinished Song** — talk to Biscuit, ask Ozzie, clear round 5 in Meow Melody, then play the song for Biscuit. Rewards: 10 tokens, a bouquet and the "Encore!" achievement.
- **Character voices** — original synthesised sounds, no audio files:
  - Mini chirps, Magic gives a low "mrrp", Chutki squeaks and Racon chitters (he never meows).
  - Voices play on emotes and when you start talking to someone, with slight variation each time.
  - There's a volume slider in Settings.
- **Removed:**
  - **Cat Battleship** is gone from the playable catalogue, along with its page and route.
  - **The Typing Arena building** is now Pawville Station. PawType lives in the arcade.

## Save compatibility

- New fields in the world save: `tokens`, `claims` and `records`. In the adventure save: `friends`.
- Older saves load and get default values for these fields. Existing data is kept, and junk values are cleaned.
- These cases are covered by the tests.

## Tests run

- **Unit tests:** `node --test` passes **167/167**. That's the 157 existing tests plus 10 new city tests. Two existing tests were updated on purpose, for the Battleship retirement and the station door.
- **Typecheck:** run with stand-in type definitions that reject `null` in JSX attributes. No new errors. Run `npm run build` locally for the real check.
- **Headless Chromium** (a dev bundle, with a stub in place of Supabase). No page errors in any of these:
  - The train from town to the city and back.
  - Clementine's branching choice, which records friendship and the gift (given once only).
  - Buying at the bakery, including a double click that only spends once.
  - Selling a koi at the market.
  - The claw machine: wins and misses, records, and the button disabling at 0 tokens.
  - Meow Melody: three rounds, the second chance, game over, the record and the tokens.
  - The PawType cabinet opening `/games/pawtype`.
  - The fountain wish (once per day).
  - Sitting on a bench and standing up by moving.
  - The ticket machine.
  - The vending machine: a double click dispenses only once.
- **Frame rate:** about 57–60 fps in headless Chromium in every city area, on desktop and phone sizes.

## Not done yet (deferred)

- Districts not built yet: Grand Park, Residential, Rooftops and Old Town.
- Shop interiors (shops open as panels for now).
- Cinema and karaoke minigames.
- Cat Café Rush, Fish Frenzy, Paw Kart and Paw & Seek.
- Furniture-placement and gardening overhauls. The existing home and garden still work.
- Cooking, festivals, new idle animations and the full pixel-art overhaul.
- **Two-player testing:** not done on real devices. The new city content is personal to each player (it isn't shared through the couple channel). Partners see each other in the city through region presence.
- **Builds:** no APK or Windows installer was built.
