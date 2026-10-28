import { useCallback, useEffect, useRef, useState } from 'react';
import { worldSaveStore, type WorldSave } from './worldSave.ts';

/** World save state for a screen; writes go straight to storage. Re-reads when another tab writes. */
export function useWorldSave() {
  const [save, setSave] = useState<WorldSave>(() => worldSaveStore().load());
  const ref = useRef(save);
  ref.current = save;
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pawville:world') setSave(worldSaveStore().load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const update = useCallback((fn: (s: WorldSave) => WorldSave) => {
    const next = fn(ref.current);
    ref.current = next;
    worldSaveStore().save(next);
    setSave(next);
    return next;
  }, []);
  return { save, update, ref };
}
