# Pawville — Milestone 8: World Complete & Art Overhaul (first pass)

This is a rebuild on top of the Milestone 7 project you sent. Everything from Milestones 1–7 is kept, and older saves load without changes.

## What's new

### Whiskerwick: all ten districts can be visited
- **Grand City Park** (north of Central Plaza):
  - Lily Pond with a bridge and three paddling ducks, a gazebo you can sit in, picnic blankets
  - the glass conservatory, a hedge maze (with a stamp hidden inside), berry bushes, benches and fishing from the bridge
  - NPCs: Professor Bloom and Nana Tulip
- **Residential District** (east side of the park):
  - three apartment styles with balconies, two townhouse styles, a laundry line and a courtyard with planters
  - a community herb garden
- **Old Town** (through the archway north of the station):
  - Clock Square and the clock tower, Library Row, Lantern Alley, a hidden courtyard with the two-paw symbol, and an old well
  - antique, book and boutique shops; the antique shop also buys rare finds
  - NPCs: Mr. Velvet and Wren
- **Rooftops** (iron stairs at the east end of Library Row):
  - roofs joined by plank bridges over a parallax skyline whose windows light up at night
  - rooftop café, herb garden, telescope, a secret roof, and Sky the stargazer
- **New things in the Milestone 7 districts:**
  - Plaza: market stalls, flowerbeds and a crowned cat statue.
  - Boardwalk: gulls, a shell stall, a working ice-cream cart and the Le Petit Moustache bistro.
- **Three walk-in interiors:**
  - **Hearth & Whisker**, a furniture showroom that shows the real furniture art.
  - **The Old Library**: ledger, local history and star atlas.
  - **The Purring Cup**: order at the counter, sit at a table or on the window seat.
- **Not yet walk-in:** the other shops still open a shop menu.

### New quests
- **The Clock That Stopped at Eleven:** read the ledger in the library, talk to Sky, find the key on the rooftops, then wind the clock.
- **The Lost Blue Scarf:** find Nana Tulip's scarf and bring it back.
- **Five Old Stamps:** a hidden hunt across the maze, the courtyard, Old Town, the rooftops and the library.

Rewards are granted once only. First visits to the park, Old Town and the rooftops are recorded in the scrapbook.

### Home
- **12 furniture pieces in 6 styles**, bought with tokens at Hearth & Whisker. Every piece does something.
  - You can place as many copies as you own; putting a piece away returns it to storage.
  - A double click buys only one.
- **What the furniture does:**
  - Lamps, the fireplace and fairy lights switch on and off. The room goes dark when all lights are off, and this is saved.
  - Stove: cooking.
  - Dining set and tea cart: eat, or share with your partner (sharing records a memory).
  - Keepsake cabinet: shows your items, trophies and memories.
  - Herb planter: a free harvest once a day, and it never wilts.
  - Record player: plays music.
- **Cooking:** 6 recipes, each with a real result.
  - A cook either uses up the ingredients and makes the dish, or changes nothing.
  - The recipe book remembers what you've cooked.
  - Cooking 3 different recipes unlocks the "Home chef" achievement.
- **Idle cat at home:** grooms, yawns and twitches its ears on separate cycles. This is turned off when reduced motion is on.

## Save compatibility
- New world-save fields: `furniture` and `recipes`. In the home save: `lightsOff`.
- These fields are only added when they're used, so older saves load unchanged. This is covered by tests.

## Tests run
- **Unit tests:** `node --test` passes **174/174**. That's the 167 existing tests plus 7 new ones covering:
  - cooking, including that a failed cook uses nothing
  - herbs never dying
  - furniture ownership and placement limits
  - light toggling
  - reachability of every spot and arrival point in all 13 regions
  - the Old Town quest, with rewards given once only
  - NPC routines
- **Typecheck:** run with stand-in type definitions for React (the real types couldn't be downloaded). 0 new errors.
- **Headless Chromium:**
  - The park, maze, residential district, Old Town, rooftops and all three interiors load with no page errors at about 57–61 fps.
  - Furniture flow:
    - A double click bought one stove.
    - It was placed at home, saved and still there after a reload.
    - The button greys out once every owned copy is placed.
    - Cooking a fish pie used the ingredients, added the pie and saved the recipe.

## Not done
- **Existing art:** the original town, harbor, forest, highlands and isles were not redrawn, and the cats have no new animation frames (running, turning, starting and stopping).
- **Gardening at home:** only the herb planter so far.
- **Not built:**
  - a cinema film experience and karaoke
  - the Cat Café Rush and Fish Frenzy arcade games
  - an animated train
  - footstep sounds that change with the ground
- **Multiplayer:**
  - Shared homes aren't synced between partners, and visiting permissions aren't enforced on a server.
  - The "Reconnecting" problem hasn't been investigated or reproduced yet.
- **Not run or built here:** the real `vite build`, two-device multiplayer tests, an APK or a Windows installer.
