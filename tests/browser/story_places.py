"""The Wind Steps (stand still to hear the wind) and the temple, in real Chromium.  usage: PV_BASE=http://localhost:5199 python3 tests/browser/story_places.py"""
import sys, json; sys.path.insert(0, 'scripts/browser')
from pvtest import *
C = Checks('story places')
A1 = ['a1-chime', 'a1-biscuit', 'a1-clues', 'a1-chime-repair', 'a1-gate', 'a1-end']
base = {'flags': ['lumi-home', 'constellation-lumi', 'region:city', 'region:temple'], 'quests': {'lost-star': {'status': 'done', 'step': 8, 'count': 0, 'hits': [], 'startedAt': 1, 'doneAt': 2}},
        'story': {'done': A1, 'chime': 'careful', 'phrases': ['biscuit'], 'tones': {'kindness': 2, 'curiosity': 0, 'courage': 0, 'patience': 3, 'playfulness': 0}}}
def name(P): e = P.pg.query_selector('.pv-dialogue__name'); return e.inner_text() if e else None
with session(1, viewport=(640, 420)) as S:
    A, = S.players
    A.seed(where={'region': 'rooftops', 'x': 120, 'y': 345}, adventure=base); A.open()
    C.check('Wind Steps prompt', 'old stone steps' in (A.prompt() or ''), A.prompt())
    A.tap('KeyE'); A.pg.wait_for_timeout(1500)
    listening = lambda: A.pg.query_selector('.pv-listen') is not None
    scene_open = lambda: A.pg.query_selector('.pv-dialogue:not(.pv-listen)') is not None
    C.check('the listening sheet is up and the scene has NOT started at 1.5 s', listening() and not scene_open())
    A.pg.wait_for_timeout(3500)
    C.check('after ~4 s of standing still the scene opens', scene_open() and not listening(), str(name(A)))
    A.pg.screenshot(path='/home/claude/scratch/windsteps.png')
    A.tap('Escape'); A.tap('Escape'); A.pg.wait_for_timeout(300)
    # moving resets the wait (the wind slips away); nothing opens until you are still again
    A.tap('KeyE'); A.pg.wait_for_timeout(1500); A.pg.keyboard.down('KeyD'); A.pg.wait_for_timeout(300); A.pg.keyboard.up('KeyD'); A.pg.wait_for_timeout(3000)
    C.check('walking resets the listening: still no scene 3 s after moving', listening() and not scene_open())
    A.pg.wait_for_timeout(2000)
    C.check('…and it opens once you have been still long enough again', scene_open())
    C.check('no console errors', not A.errors, str(A.errors)[:200])
    A.pg.close()
    done2 = {**base, 'story': {**base['story'], 'done': A1 + ['a2-biscuit-truth', 'a2-velvet', 'a2-arrange', 'a2-gate'], 'phrases': ['biscuit', 'wind', 'lantern', 'garden', 'echo', 'rise']}}
    T = Player(S.ctx, 'T', None); T.seed(where={'region': 'temple', 'x': 288, 'y': 424}, adventure=done2); T.open()
    C.check('the temple loads as its own region', T.st()['region'] == 'temple', T.st()['region'])
    T.hold('KeyW', 2400); T.pg.wait_for_timeout(400)
    C.check('walk up the old trail to the terrace', T.pos()[1] < 400, str(T.pos()))
    T.shot('/home/claude/scratch/temple_view.png')
    C.check('no console errors in the temple', not T.errors, str(T.errors)[:200])
    C.summary()
