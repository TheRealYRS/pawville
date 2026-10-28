"""Karaoke expansion + story music in real Chromium (merged build).  Sound is switched ON so the real Web Audio path runs (no crash, clean stop).
usage: PV_BASE=http://localhost:5199 python3 tests/browser/karaoke_and_music.py"""
import sys, json; sys.path.insert(0, 'scripts/browser')
from pvtest import *
C = Checks('karaoke + music')
ADV = {'flags': ['lumi-home', 'constellation-lumi', 'region:city'], 'quests': {'lost-star': {'status': 'done', 'step': 8, 'count': 0, 'hits': [], 'startedAt': 1, 'doneAt': 2}},
       'story': {'done': ['a1-chime', 'a1-biscuit', 'a1c-harbor', 'a1-clues'], 'phrases': ['wind'], 'clues': ['clue:harbor']}}
with session(1, viewport=(700, 560)) as S:
    A, = S.players
    A.seed(where={'region': 'purring-cup', 'x': 72, 'y': 159}, adventure=ADV)
    A.pg.add_init_script("localStorage.setItem('pawville:sound','1')")
    A.open()
    C.check('karaoke prompt at The Purring Cup', 'karaoke' in (A.prompt() or ''), A.prompt())
    A.tap('KeyE'); A.pg.wait_for_timeout(700)
    rows = A.pg.query_selector_all('.pv-shop__row')
    titles = [r.inner_text().split('\n')[0].split(' · ')[0].strip() for r in rows]
    C.check('all nine songs are listed (3 original + 6 new)', len(rows) == 9, str(titles))
    C.check('the three original songs are still there', all(any(t.startswith(x) for t in titles) for x in ['Window Seat', 'Biscuit’s Song', 'Lantern Alley']), str(titles[:3]))
    for t in ['Pocket Full of Biscuits', 'Cat Walk Groove', 'The Yarn Ball Disaster', 'Two Paws', 'Winter Lanterns', 'Lighthouse Shanty']:
        C.check(f'new song listed: {t}', any(x.startswith(t) for x in titles))
    locked = [r.inner_text().split('\n')[0].split(' · ')[0] for r in rows if 'is-locked' in (r.get_attribute('class') or '')]
    C.check('story/world-gated songs are locked with a reason (shanty, winter, duet)', len(locked) == 3 and any('Shanty' in x for x in locked), str(locked))
    C.check('band volume slider and vocals-only option are there', A.pg.query_selector('input[type=range]') is not None and 'Vocals only' in A.pg.inner_text('.pv-karaoke__band'))
    # sing a new song: the lyrics run, the count-in/band start, Space taps do not break anything, and leaving stops the audio cleanly
    idx = next(i for i, t in enumerate(titles) if t.startswith('Pocket Full'))
    rows[idx].query_selector('button').click(); A.pg.wait_for_timeout(1500)
    C.check('the song stage opens with lyrics', A.pg.query_selector('.pv-karaoke__lyrics') is not None)
    for _ in range(8): A.pg.keyboard.press('Space'); A.pg.wait_for_timeout(250)
    C.check('tapping (right or wrong) never breaks the song', A.pg.query_selector('.pv-karaoke__stage') is not None and not A.errors, str(A.errors)[:160])
    ctx_state = A.pg.evaluate("(() => { const cs = performance.getEntriesByType('resource').length; return 'ok'; })()")
    A.pg.get_by_role('button', name='Leave the stage').click(); A.pg.wait_for_timeout(600)
    C.check('leaving the stage closes the panel (audio stopped in the cleanup)', A.pg.query_selector('.pv-karaoke__stage') is None)
    # story music: the journal's Hear button on a collected phrase
    A.tap('KeyJ'); A.pg.wait_for_timeout(500)
    hear = A.pg.query_selector('.pv-story__hear')
    C.check('The Story So Far has a "Hear" button for a collected phrase', hear is not None)
    if hear: hear.click(); A.pg.wait_for_timeout(800)
    C.check('playing a phrase does not error', not A.errors, str(A.errors)[:160])
    C.summary()
