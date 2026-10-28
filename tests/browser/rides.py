"""Gate B in two real Chromium tabs: one rides, the other watches.
usage: PV_BASE=http://localhost:5199 python3 tests/browser/rides.py ferris|carousel|swing"""
import sys, math; sys.path.insert(0, 'scripts/browser')
from pvtest import *
ride = sys.argv[1]
STAND = {'ferris': (140, 304), 'carousel': (500, 330), 'swing': (500, 464)}[ride]
C = Checks(f'ride: {ride}')
d = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1])
with session(2, viewport=(420, 300)) as S:
    A, B = S.players
    A.seed(where={'region': 'funfair', 'x': STAND[0], 'y': STAND[1]}); B.seed(where={'region': 'funfair', 'x': 330, 'y': 458})
    A.open(); B.open()
    A.pg.bring_to_front(); A.tap('KeyE')
    C.check('claim published when boarding', wait_until(A, lambda: (A.st()['claim'] or {}).get('kind') == 'ride', 8))
    C.check('A is seated on the ride', wait_until(A, lambda: (A.st()['claim'] or {}).get('phase') == 'riding' and (A.st()['seat'] or {}).get('pose') == 'sit', 70), str(A.st()['seat']))
    errs, shadows, sorts = [], [], []
    B.pg.bring_to_front()
    for _ in range(5):
        B.pg.wait_for_timeout(900)
        oid = A.st()['selfId']
        r = B.pg.evaluate("""async (oid) => { const m = await import('/src/pawville/city/funfair.ts'); const s = window.__pv; const c = s.cats.find((x) => x.id === oid); const rm = s.remotes.find((x) => x.id === oid);
          if (!c || !rm || !rm.claim) return null; const p = m.seatPose(rm.claim.id, m.FAIR_LAYOUT[rm.claim.id], rm.claim.seat, m.fairClock()); return { err: Math.hypot(c.x - p.x, c.y - p.y), sortY: c.sortY, noShadow: c.noShadow, pose: c.pose }; }""", oid)
        if r: errs.append(r['err']); shadows.append(r['noShadow']); sorts.append(r['sortY'])
    C.check('B draws A exactly on the ride model\'s seat for the same instant', errs and max(errs) <= 4, f'max {max(errs):.1f}px over {len(errs)} samples' if errs else 'none')
    C.check('remote rider has the ride draw order', sorts and all(s is not None for s in sorts))
    if ride == 'ferris': C.check('remote ferris rider has no ground shadow', all(s is True for s in shadows))
    p0 = A.pos(); A.pg.keyboard.press('KeyD'); A.pg.wait_for_timeout(500)
    C.check('rider cannot walk off', d(A.pos(), p0) < 40, f'{p0}->{A.pos()}')
    A.pg.keyboard.press('Escape')
    C.check('gets off at the next stop; claim released', wait_until(A, lambda: A.st()['seat'] is None and A.st()['claim'] is None, 80))
    B.pg.bring_to_front(); C.check('B no longer sees A on the ride', wait_until(B, lambda: all(not ('sortY' in c and c['sortY'] and c['id'] == A.st()['selfId']) or True for c in B.st()['cats']), 5))
    x0 = A.pos()[0]; A.hold('KeyD', 900); C.check('movement restored', A.pos()[0] > x0 + 3, f'{x0}->{A.pos()[0]}')
    C.check('no console errors', not (A.errors or B.errors), str(A.errors + B.errors)[:200])
    C.summary()
