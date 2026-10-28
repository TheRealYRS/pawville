import { useEffect, useState } from 'react';
import { isSoundEnabled, setSoundEnabled, subscribeSound } from '../lib/soundService';

export function useSound(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(isSoundEnabled());
  useEffect(() => subscribeSound(setOn), []);
  return [on, setSoundEnabled];
}
