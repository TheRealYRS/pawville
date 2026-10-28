# Our Home — in-scene UI (Milestone 10, home overhaul)

The home is ONE full-screen scene. The room is the stage; nothing sits "outside" it any more.

| Part | What it does |
|---|---|
| Top bar | Back to Pawville · title · who is home (partner status chip) · Scrapbook · sound |
| The room | Fills the screen (scales to fit, no page scrolling). Tap the floor to walk, tap furniture to use it. |
| Dock (under the room) | **Decorate · Garden · Mailbox (unread badge) · Treasures**. Garden, Mailbox and Treasures open as sheets OVER the live room (Esc / ✕ / click outside closes them). |
| Decorating | A tray: side panel on wide screens, bottom drawer on phones. **Drag** furniture in, **drag** pieces to move them, **drag one back onto the tray** to put it away, or tap a piece for its toolbar (rotate / put away). Everything saves as you go; **Undo** (Ctrl+Z) takes the last change back. |
| Keyboard | Tray piece + Enter, arrows to move it, Enter to place · R rotate · Delete put away · Ctrl+Z undo · Esc back out |

## The cat now really climbs
Cause of the bug: the climbing shelves only lifted the cat 12 px, but their top board is ~40 px up the wall, so the cat floated near the floor.
Now (`home/homeWalk.ts → climbRoute`) the cat hops board to board and sits on the top board; the window perch is one hop to the cushion; the cat tree is three hops up to the top bed.
"Get down" (or Esc, or walking away) hops back down first. Cat shelves and the window perch can only be hung on the lower wall row so a sitting cat fits in the picture (new placements only; old saved homes keep their pieces and still work).

## Other fixes in this pass
- Tapping a piece you are already standing beside now starts at once. Starting to decorate makes the cat get down first.
- Ferris wheel: one turn is now **28 s** (was 48 s).
- `public/sw.js`: each offline-shell file is cached on its own, so one missing icon no longer stops the whole shell being cached.
- `public/favicon.svg` added (the ContextForge export leaves SVG/PNG files out, which made the branding test fail anywhere except your own machine).
- Interaction prompt in town sits 10 px higher, clear of the action bar.

## Still true
- The room layout is saved **on this device only**. Sharing a home with your partner (or visiting theirs) needs a server table — a later step.
- Supabase migrations: `20261026000001_pawville_invite_status.sql` is dated one day ahead of today. It was NOT renamed (renaming an applied migration breaks the CLI's history). Name every NEW migration after it, e.g. `20261026000002_…`.
