/**
 * Milestone 8.1: one bottom sheet for short interaction states (sitting, fishing, telescope status).
 * Root cause of the clipped "You're sitting comfortably…" text: `.pv-sitbar`/`.pv-fishing` reused `.pv-dock`
 * (30px corner radius, overflow:auto) but had no padding — content started 1px inside the rounded border.
 * The sheet's inner padding is derived from its radius so text can never sit under a corner.
 */
import type { ReactNode } from 'react';

export function PanelSheet({ label, title, children, actions, className = '' }: { label: string; title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`pv-sheet ${className}`.trim()} aria-label={label} data-ui="sheet">
      <div className="pv-sheet__content" data-ui="content">
        {title && <h2 className="pv-sheet__title">{title}</h2>}
        {children}
      </div>
      {actions && <div className="pv-sheet__actions">{actions}</div>}
    </section>
  );
}
