import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { sfx } from '../lib/soundService';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'midnight';
  size?: 'lg' | 'md' | 'sm';
  icon?: ReactNode;
  loading?: boolean;
  silent?: boolean;
}

export function Button({
  variant = 'secondary', size = 'md', icon, loading = false, silent = false,
  className = '', children, onClick, disabled, type = 'button', ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size} ${loading ? 'is-loading' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (!silent) sfx.click();
        onClick?.(e);
      }}
      {...rest}
    >
      {loading ? <span className="btn__spinner" aria-hidden="true" /> : icon ? <span className="btn__icon" aria-hidden="true">{icon}</span> : null}
      <span className="btn__label">{children}</span>
    </button>
  );
}
