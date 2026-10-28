interface PawPrintProps {
  size?: number;
  color?: string;
  className?: string;
}

export function PawPrint({ size = 20, color = 'currentColor', className = '' }: PawPrintProps) {
  return (
    <svg className={`paw-print ${className}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g fill={color}>
        <ellipse cx="16" cy="21.5" rx="7.2" ry="6" />
        <ellipse cx="7" cy="13.5" rx="3" ry="3.8" transform="rotate(-18 7 13.5)" />
        <ellipse cx="12.5" cy="8.5" rx="3" ry="3.9" transform="rotate(-6 12.5 8.5)" />
        <ellipse cx="19.5" cy="8.5" rx="3" ry="3.9" transform="rotate(6 19.5 8.5)" />
        <ellipse cx="25" cy="13.5" rx="3" ry="3.8" transform="rotate(18 25 13.5)" />
      </g>
    </svg>
  );
}
