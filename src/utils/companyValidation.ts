// Lightweight heuristics to detect gibberish or unlikely company names

const REPEATED_CHAR = /(.)\1{3,}/; // e.g., aaaa, 1111
const KEYBOARD_WALK = /(qwerty|asdfgh|zxcv|poiuy|lkjhg|mnbv)/i;
const MOSTLY_CONSONANTS = /^[bcdfghjklmnpqrstvwxyz\s.,'-]{4,}$/i;
const NO_VOWELS = /^(?!.*[aeiou]).{4,}$/i;

const GENERIC_PHRASES = new Set([
  'help me set up',
  'help me setup',
  'let\'s start',
  'onboard me',
  'start onboarding',
  'get started',
  'begin',
]);

export function isGenericPlaceholder(input: string): boolean {
  const s = (input || '').trim().toLowerCase();
  if (!s) return true;
  return GENERIC_PHRASES.has(s);
}

export function isGibberish(input: string): boolean {
  const s = (input || '').trim();
  if (!s) return true;
  if (s.length <= 2) return true;
  if (REPEATED_CHAR.test(s)) return true;
  if (KEYBOARD_WALK.test(s)) return true;
  if (NO_VOWELS.test(s)) return true;
  if (MOSTLY_CONSONANTS.test(s) && /\b[a-z]{4,}\b/i.test(s)) return true;
  return false;
}

export function sanitizeCandidate(input: string): string {
  // Remove leading verbs like "research", punctuation, and trim
  let s = String(input || '').replace(/^(research|analy[sz]e|investigate|look\s*up|tell me about)\s+/i, '').trim();
  s = s.replace(/[?]/g, '').trim();
  s = s.replace(/^[^A-Za-z0-9(]+/, '').replace(/[^A-Za-z0-9)&.\-\s]+$/, '').trim();
  return s.slice(0, 120);
}

