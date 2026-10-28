"""Gate A in real Chromium tabs (one tab = one player; tabs share a mock realtime channel).
Opposite moves, then one player disconnects, then a player (re)connects.
usage: PV_BASE=http://localhost:5199 python3 tests/browser/ownership_disconnect.py"""
import sys; sys.path.insert(0, 'scripts/browser')
from pvtest import *
C = Checks('ownership: opposite moves, disconnect, reconnect')
with session(2) as S:
    A, B = S.players
    for P in (A, B): P.seed(where={'region': 'funfair', 'x': 320, 'y': 458})
    A.open(); B.open()
    ida = A.st()['selfId']; a0, b0 = A.pos(), B.pos()
    A.down('KeyD'); B.down('KeyA'); A.pg.wait_for_timeout(1800); A.up('KeyD'); B.up('KeyA'); A.pg.wait_for_timeout(1000)
    a1, b1 = A.pos(), B.pos()
    C.check('A moved right and only A (y unchanged)', a1[0] > a0[0] + 3 and abs(a1[1] - a0[1]) < 1, f'{a0}->{a1}')
    C.check('B moved left, at the same time', b1[0] < b0[0] - 3, f'{b0}->{b1}')
    B.pg.bring_to_front(); B.pg.wait_for_timeout(1500); oa = B.others()
    A.pg.bring_to_front(); A.pg.wait_for_timeout(1500); ob = A.others()
    C.check('each sees the other exactly where it is', ob and oa and abs(ob[0]['x'] - b1[0]) < 4 and abs(oa[0]['x'] - a1[0]) < 4)
    B.pg.close(); A.pg.wait_for_timeout(2500)
    p0 = A.pos(); A.hold('KeyD', 1500)
    C.check('A still controls A after B disconnects (no stale target)', A.pos()[0] > p0[0] + 3, f'{p0}->{A.pos()}')
    C.check('B left A\'s roster', len([c for c in A.others() if c['id'].startswith('cat_')]) == 0)
    B2 = Player(S.ctx, 'B2', None); B2.seed(where={'region': 'funfair', 'x': 320, 'y': 458}); B2.open()
    q = B2.pos(); B2.hold('KeyA', 1500)
    C.check('a reconnecting player controls only their own cat, with a fresh identity', B2.pos()[0] < q[0] - 3 and B2.st()['selfId'] != ida, f'{q}->{B2.pos()}')
    A.pg.bring_to_front(); a_now = A.pos(); B2.pg.bring_to_front(); B2.hold('KeyA', 600)
    C.check('and A did not move', A.pos() == a_now, f'{a_now}->{A.pos()}')
    C.check('no console errors', not (A.errors or B2.errors), str(A.errors + B2.errors)[:200])
    lis = A.listeners(); C.check('no keydown-listener build-up on A', lis.get('w:keydown', 0) <= 6, str(lis))
    C.summary()
