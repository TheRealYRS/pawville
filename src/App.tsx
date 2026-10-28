import { Fragment, useEffect, useState, type ReactNode } from 'react';
import {TitleScreen} from './pawville/components/TitleScreen';
import { GameRoomPage } from './pages/GameRoomPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OfflineGamePage } from './pages/OfflineGamePage';
import { useRoute } from './router';
import { initPairHub } from './pawville/couple/pairHub.ts';
import { usePathname } from './pawville/navigation';
import { BoxingPage } from './pawville/pages/BoxingPage';
import { CoupleHomePage } from './pawville/pages/CoupleHomePage';
import { MemoryPawsPage } from './pawville/pages/MemoryPawsPage';
import { PairInvitePage } from './pawville/pages/PairInvitePage';
import { PawSnapPage } from './pawville/pages/PawSnapPage';
import { PawTypePage } from './pawville/pages/PawTypePage';
import { PuzzleGardenPage } from './pawville/pages/PuzzleGardenPage';
import { ScrapbookPage } from './pawville/pages/ScrapbookPage';
import { TownPage } from './pawville/pages/TownPage';
import { WhackACatPage } from './pawville/pages/WhackACatPage';
import { matchAppPath, screenKey, type AppRoute } from './pawville/routes.ts';

function pageFor(route: AppRoute): ReactNode {
  switch (route.name) {
    case 'town': return <TownPage />;
    case 'arcade': return <HomePage />;
    case 'room': return <GameRoomPage roomId={route.id} />;
    case 'computer': return <OfflineGamePage mode="computer" />;
    case 'local': return <OfflineGamePage mode="local" />;
    case 'home': return <CoupleHomePage />;
    case 'scrapbook': return <ScrapbookPage />;
    case 'pair': return <PairInvitePage code={route.code} />;
    case 'game':
      switch (route.id) {
        case 'pawtype': return <PawTypePage />;
        case 'cat-boxing': return <BoxingPage />;
        case 'memory-paws': return <MemoryPawsPage />;
        case 'whack-a-cat': return <WhackACatPage />;
        case 'puzzle-garden': return <PuzzleGardenPage />;
        case 'paw-snap': return <PawSnapPage />;
      }
      return <NotFoundPage />;
    case 'notfound': return <NotFoundPage />;
  }
}

/**
 * One application, one source of truth for "which screen": the URL path. The original router is
 * still used for navigation (and subscribed to here), but the screen is derived from
 * window.location so the URL and the rendered screen can't disagree. Each screen is keyed, so
 * leaving it unmounts everything it owned (timers, listeners, result overlays).
 * The couple connection lives outside the screens (pairHub) so it survives navigation.
 */
export function App() {
  const [entered,setEntered]=useState(()=>{try{return sessionStorage.getItem("pawville:entered")==="1";}catch{return false;}});
  useRoute();
  const pathname = usePathname();
  const route = matchAppPath(pathname);
  const key = screenKey(route);
  useEffect(() => { void initPairHub(); }, []);
  if(route.name==='town'&&!entered)return <TitleScreen onStart={()=>{try{sessionStorage.setItem('pawville:entered','1');}catch{/* optional */}setEntered(true);}}/>;
  return (
    <>
      <Fragment key={key}>{pageFor(route)}</Fragment>
      <div key={`curtain:${key}`} className="pv-route-curtain" aria-hidden="true" />
    </>
  );
}
