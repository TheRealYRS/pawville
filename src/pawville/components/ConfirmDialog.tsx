import type { ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel, danger }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel} className="pv-modal">
      <div className="pv-panel__blurb">{children}</div>
      <div className="modal__actions">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant={danger ? 'secondary' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
