import { Button } from '../../components/Button';
import { CatCharacter } from '../../components/CatCharacter';
import { Starfield } from '../../components/Starfield';
import { BackToPawville } from '../components/BackToPawville';
import { PATHS } from '../destinations.ts';
import { goTo } from '../navigation';

/** Generic "not open yet" page for future activities (currently unused; every game is playable). */
export function ComingSoonPage({ title, where }: { title: string; where: string }) {
  return (
    <main className="pv-game">
      <Starfield density={22} paws={3} />
      <BackToPawville />
      <section className="pv-setup">
        <div aria-hidden="true"><CatCharacter cat="T" mood="thinking" size={96} /></div>
        <span className="pv-chip pv-chip--soon">Coming soon</span>
        <h1 className="pv-game__title">{title}</h1>
        <p className="pv-note">It will open at the {where} in Pawville. Nothing here is playable yet.</p>
        <Button variant="primary" onClick={() => goTo(PATHS.town)}>Back to Pawville</Button>
      </section>
    </main>
  );
}
