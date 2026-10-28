export type StatusTone = 'mine' | 'theirs' | 'neutral' | 'warn' | 'good' | 'T' | 'M';

export function GameStatus({ text, tone = 'neutral' }: { text: string; tone?: StatusTone }) {
  return (
    <div className={`game-status game-status--${tone}`} role="status" aria-live="polite" aria-atomic="true">
      <span key={text} className="game-status__text">{text}</span>
    </div>
  );
}
