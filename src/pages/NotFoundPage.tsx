import { Button } from '../components/Button';
import { StateScreen } from '../components/StateScreen';
import { navigate } from '../router';

export function NotFoundPage() {
  return (
    <StateScreen
      cat="M"
      mood="surprised"
      title="This page wandered off"
      message="Cats do that. Let's get you back to the arena."
      actions={<Button variant="primary" onClick={() => navigate('/')}>Back to lobby</Button>}
    />
  );
}
