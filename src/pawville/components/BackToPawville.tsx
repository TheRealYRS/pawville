import { PawPrint } from '../../components/PawPrint';
import { PATHS } from '../destinations.ts';
import { goTo } from '../navigation';

/** Shared "return to the town" control used by every activity. */
export function BackToPawville({ label = 'Pawville', className = '', onBeforeLeave }: { label?: string; className?: string; onBeforeLeave?: () => void }) {
  return (
    <button type="button" className={`pv-back ${className}`} onClick={() => { onBeforeLeave?.(); goTo(PATHS.town); }} aria-label="Back to Pawville town">
      <PawPrint size={16} />
      <span>{label}</span>
    </button>
  );
}
