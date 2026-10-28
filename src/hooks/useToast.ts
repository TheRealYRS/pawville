import { useCallback, useRef, useState } from 'react';

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'warn' | 'success';
}

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string, tone: ToastMessage['tone'] = 'info', ms = 2600) => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), text, tone });
    timer.current = window.setTimeout(() => setToast(null), ms);
  }, []);
  return { toast, show };
}
