"""Parts 7+8 in real Chromium: a story scene played with the keyboard, a resident's remembered answer across a RELOAD, the People journal, and the temple.
usage: PV_BASE=http://localhost:5199 python3 tests/browser/story_and_npcs.py"""
import sys, json; sys.path.insert(0, 'scripts/browser')
from pvtest import *
C = Checks('story + residents')
ADV = {'flags': ['lumi-home', 'constellation-lumi', 'region:city'], 'quests': {'lost-star': {'status': 'done', 'step': 8, 'count': 0, 'hits': [], 'startedAt': 1, 'doneAt': 2}}}
def adv(P): return json.loads(P.pg.evaluate("localStorage.getItem('pawville:adventure')") or 'null')['data']
def name(P): e = P.pg.query_selector('.pv-dialogue__name'); return e.inner_text() if e else None
def text(P): e = P.pg.query_selector('.pv-dialogue__text'); return e.inner_text() if e else ''
with session(1, viewport=(640, 420)) as S:
    A, = S.players
    A.seed(where={'region': 'town', 'x': 440, 'y': 468}, adventure=ADV); A.open()
    C.check('story prompt at the old chime', 'chime' in (A.prompt() or '').lower(), A.prompt())
    A.tap('KeyE'); A.pg.wait_for_timeout(500)
    names = set()
    for _ in range(8):
        names.add(name(A)); 
        if A.pg.query_selector('.pv-dialogue__choices'): break
        A.tap('KeyE'); A.pg.wait_for_timeout(250)
    C.check('multi-speaker scene: narration, then Lumi speaks', 'Lumi' in names and len(names) >= 2, str(names))
    C.check('four replies, tones labelled', len(A.pg.query_selector_all('.pv-choice')) == 4)
    A.tap('Digit1'); A.pg.wait_for_timeout(500)
    C.check('pressing 1 picks the first reply and Lumi answers', name(A) == 'Lumi' and 'Everywhere' in text(A), text(A)[:60])
    A.pg.wait_for_timeout(1200)
    s = adv(A)['story']
    C.check('answer persisted: scene done, tone recorded, clue and bond stored', 'a1-chime' in s['done'] and s['tones']['curiosity'] == 1 and 'clue:lumi-knew' in s['clues'] and s['bonds']['lumi'] == 1, str(s)[:160])
    A.tap('Escape'); A.pg.wait_for_timeout(300)
    A.tap('KeyE'); A.pg.wait_for_timeout(400)
    C.check('visiting the finished chime again does not replay the scene', 'Everywhere' not in text(A) and 'old street chime' not in text(A).lower() or 'clearing its throat' in text(A), text(A)[:70])
    A.tap('Escape')
    A.tap('Escape'); A.pg.close()
    # ---- a resident: Mabel (a quest character) gets a personality conversation; new tabs share the SAME saved game ----
    def tab(x, y):
        P = Player(S.ctx, 'T', None); P.seed(where={'region': 'town', 'x': x, 'y': y}, adventure=ADV); P.open(); return P
    B = tab(322, 466)
    C.check('Mabel prompt', 'Mabel' in (B.prompt() or ''), B.prompt())
    B.tap('KeyE'); B.pg.wait_for_timeout(500)
    for _ in range(10):
        if B.pg.query_selector('.pv-dialogue__choices'): break
        B.tap('KeyE'); B.pg.wait_for_timeout(250)
    C.check('her old dialogue is intact and a personality question follows it', 'remember this place' in text(B) and len(B.pg.query_selector_all('.pv-choice')) == 3, text(B)[:80])
    B.tap('KeyE'); B.pg.wait_for_timeout(300)
    C.check('E alone never picks a reply (choices still showing)', len(B.pg.query_selector_all('.pv-choice')) == 3)
    B.tap('ArrowDown'); B.tap('ArrowDown'); B.pg.wait_for_timeout(200); B.tap('Enter'); B.pg.wait_for_timeout(500)
    C.check('highlight + Enter picked the 2nd reply', 'night the stars' in text(B).lower(), text(B)[:80])
    B.pg.wait_for_timeout(1300); a = adv(B)
    C.check('remembered: mabel:topic=t1 and friendship +1', a['choices'].get('mabel:topic') == 't1' and a['friends'].get('mabel') == 1, str({k: v for k, v in a['choices'].items() if 'mabel' in k}))
    B.tap('Escape'); B.pg.wait_for_timeout(300); B.pg.close()
    # a brand-new page load = persistence: she remembers, and does not ask again
    D = tab(322, 466); D.tap('KeyE'); D.pg.wait_for_timeout(400); seen = []
    for _ in range(12):
        seen.append(text(D))
        if not D.pg.query_selector('.pv-dialogue'): break
        D.tap('KeyE'); D.pg.wait_for_timeout(250)
    C.check('after a reload Mabel remembers your answer', any('night the stars went quiet' in x for x in seen), ' | '.join(x[:36] for x in seen)[:200])
    C.check('and does not ask the same question twice', not any('who’ll remember this place' in x for x in seen))
    D.tap('Escape'); D.pg.wait_for_timeout(300); D.tap('KeyJ'); D.pg.wait_for_timeout(500)
    tabs = [e.inner_text() for e in D.pg.query_selector_all('.pv-tab')]
    C.check('journal has The Story So Far and People tabs', any('Story' in t for t in tabs) and 'People' in tabs, str(tabs))
    D.pg.get_by_role('tab', name='People').click(); D.pg.wait_for_timeout(300)
    jt = D.pg.inner_text('.pv-journal'); C.check('People page shows Mabel and what you learned', 'Mabel' in jt and 'asked which story' in jt, jt[:120].replace('\n', ' '))
    D.pg.get_by_role('tab', name='The Story So Far').click(); D.pg.wait_for_timeout(300)
    jt = D.pg.inner_text('.pv-journal'); C.check('Story So Far keeps the first memory, in your own words', 'first heard' in jt, jt[:110].replace('\n', ' '))
    C.check('no console errors', not (D.errors or B.errors), str(D.errors + B.errors)[:200])
    C.summary()
