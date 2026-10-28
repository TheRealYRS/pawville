import { PawPrint } from './PawPrint';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <h1 className={`logo ${compact ? 'logo--compact' : ''}`} aria-label="Paw vs Paw">
      <span className="logo__word logo__word--orange" aria-hidden="true">Paw</span>
      <span className="logo__vs" aria-hidden="true">
        <PawPrint size={compact ? 14 : 22} />
        <span>vs</span>
      </span>
      <span className="logo__word logo__word--lavender" aria-hidden="true">Paw</span>
    </h1>
  );
}
