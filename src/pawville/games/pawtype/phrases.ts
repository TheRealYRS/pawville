/**
 * PawType phrase bank (original, written for Pawville). Every phrase is lowercase letters and
 * single spaces only — no punctuation, capitals or symbols (validated in the tests).
 */
export type PhraseCategory = 'sweet' | 'funny' | 'everyday' | 'teasing' | 'cats' | 'cozy';
export const CATEGORIES: readonly { id: PhraseCategory; label: string }[] = [
  { id: 'sweet', label: 'Sweet' }, { id: 'funny', label: 'Funny' }, { id: 'everyday', label: 'Everyday' },
  { id: 'teasing', label: 'Playful teasing' }, { id: 'cats', label: 'Cat things' }, { id: 'cozy', label: 'Cozy' },
];

export const PHRASES: Record<PhraseCategory, readonly string[]> = {
  sweet: [
    'you are my favorite person', 'meet me under the stars', 'i saved the best seat for you', 'every day is better with you',
    'you make my tail wag', 'lets watch the sunset together', 'i miss you more than fish', 'you are my safe place',
    'thank you for being you', 'i keep a little light on for you',
  ],
  funny: [
    'lets go get some cake', 'the fish looked at me first', 'i only run when snacks are involved', 'my nap was rudely interrupted',
    'this box is my office now', 'i am not chubby just fluffy', 'who moved my yarn again', 'the vacuum is my sworn enemy',
  ],
  everyday: [
    'did you drink enough water today', 'remember to eat something warm', 'how was your day at work', 'call me when you get home',
    'the weather is lovely today', 'i made tea and thought of you', 'lets plan our next weekend', 'what are we having for dinner',
  ],
  teasing: [
    'i will steal your snacks', 'you snore louder than a kitten', 'i beat you last time remember', 'you type like a sleepy turtle',
    'my paws are faster than yours', 'you owe me three cookies', 'try to keep up slowpoke', 'i let you win yesterday',
  ],
  cats: [
    'the cats own this town', 'tangerine loves warm windowsills', 'midnight hides in every shadow', 'a cat nap is never long enough',
    'soft paws and quiet whiskers', 'the fountain cat never blinks', 'every box is a castle', 'purring is a kind of hug',
  ],
  cozy: [
    'blankets and rain on the window', 'a quiet walk by the harbor', 'warm socks and a slow morning', 'lanterns glowing in the park',
    'hot cocoa with tiny marshmallows', 'reading together by the fire', 'the garden smells like spring', 'soft music and sleepy eyes',
  ],
};

export const ALL_PHRASES: readonly string[] = Object.values(PHRASES).flat();

export function isValidPhrase(p: string): boolean {
  return /^[a-z]+( [a-z]+)*$/.test(p) && p.length <= 48;
}
