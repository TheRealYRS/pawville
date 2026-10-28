import type { ToastMessage } from '../hooks/useToast';

export function Toast({ toast }: { toast: ToastMessage | null }) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
