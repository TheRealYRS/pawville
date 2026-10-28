import { CatCharacter } from './CatCharacter';
import { Modal } from './Modal';

export function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="How to play" onClose={onClose}>
      <div className="howto">
        <div className="howto__cats" aria-hidden="true">
          <CatCharacter cat="T" mood="playful" pose="head" size={64} />
          <CatCharacter cat="M" mood="happy" pose="head" size={64} />
        </div>
        <ol className="howto__list">
          <li><strong>Tangerine</strong> (orange) and <strong>Midnight</strong> (black) take turns placing their cat on the 3×3 board.</li>
          <li>Get <strong>three of your cats in a row</strong> — across, down or diagonally — to win.</li>
          <li>If all nine squares fill up with no line, it&apos;s a draw.</li>
          <li><strong>Online:</strong> tap <em>Let&apos;s Play</em>, then send the invite link. Whoever opens it becomes Midnight.</li>
          <li>After each game, both cats must agree to a rematch. The starting cat alternates each round.</li>
          <li>Keyboard: arrow keys move between squares, Enter or Space places your cat.</li>
        </ol>
      </div>
    </Modal>
  );
}
