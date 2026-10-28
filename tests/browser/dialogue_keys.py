"""Gates A and E in real Chromium tabs (one tab = one player, sharing a mock realtime channel).
usage: PV_BASE=http://localhost:5199 python3 tests/browser/dialogue_keys.py"""
import sys; sys.path.insert(0, 'scripts/browser')
from pvtest import *
C = Checks('conversation keys (Gate E)')
with session(1) as S:
    D = S.players[0]
    D.seed(where={'region': 'town', 'x': 322, 'y': 462}); D.open()
    C.check('talk prompt shows', 'Mabel' in (D.prompt() or ''), D.prompt())
    D.tap('KeyE'); D.pg.wait_for_timeout(500)
    sec = lambda: D.pg.query_selector('.pv-dialogue')
    C.check('E opens the conversation', sec() is not None)
    txt = lambda: (D.pg.query_selector('.pv-dialogue__text') or D.pg.query_selector('body')).inner_text()
    t0 = txt(); D.tap('KeyE'); D.pg.wait_for_timeout(250); t1 = txt()
    C.check('E advances one line', t1 != t0, f'{t0[:30]!r} -> {t1[:30]!r}')
    D.pg.keyboard.down('Space'); 
    for _ in range(25): D.pg.keyboard.down('Space'); D.pg.wait_for_timeout(60)
    D.pg.keyboard.up('Space'); t2 = txt()
    cnt = D.pg.query_selector('.pv-dialogue__count').inner_text()
    C.check('holding a key advanced at most one line (no skipping)', t2 != t1 and cnt.startswith('3/'), f'counter {cnt}')
    p0 = D.pos(); D.pg.keyboard.down('KeyD'); D.pg.wait_for_timeout(400); D.pg.keyboard.up('KeyD')
    C.check('walking keys do nothing while talking', D.pos() == p0, f'{p0}->{D.pos()}')
    D.pg.wait_for_timeout(300); D.tap('Escape'); D.pg.wait_for_timeout(400)
    C.check('Escape closes the conversation', sec() is None)
    x0 = D.pos()[0]; D.hold('KeyD', 500); C.check('movement restored after closing', D.pos()[0] > x0 + 3, f'{x0}->{D.pos()[0]}')
    ok = C.summary()
