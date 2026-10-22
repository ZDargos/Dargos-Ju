// English text helpers for English-learning mode: cleaning the English side of a sentence pair
// into model English, splitting it into words, and comparing answers fairly.
// Shared by the build script (Node) and the app.

/** Turns a translation note like "My name is bread (literally: ...)" into clean, playable English. */
export function cleanEnglish(raw: string): string {
  let s = raw
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/(\w)�(\w)/g, "$1'$2")
    .replace(/�/g, '')
    .replace(/\s*\([^)]*\)\s*$/g, '') // trailing explanatory note
    .replace(/\s+\/\s+.*$/g, '') // "x / y" alternatives: keep the first
    .replace(/\s*\/\s*[A-Za-z][^.!?]*(?=[.!?]?$)/g, '') // "midday/noon"
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([.!?])\1+/g, '$1')
    .replace(/([.!?])(?=[A-Z])/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/[A-Za-z0-9"']$/.test(s)) s += '.';
  return s;
}

const TOKEN = /[A-Za-z][A-Za-z\d]*(?:['’-][A-Za-z\d]+)*|\d+(?:[.,:]\d+)*%?|\*+|[^\sA-Za-z\d]/g;

/** Splits English into tokens: words (keeping "don't", "well-known"), numbers, and punctuation. */
export function tokenizeEnglish(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

export const isEnglishWord = (t: string) => /^[A-Za-z][A-Za-z\d]*(?:['’-][A-Za-z\d]+)*$/.test(t);
export const isEnglishTile = (t: string) => isEnglishWord(t) || /^\d/.test(t) || /^\*+$/.test(t);

const CONTRACTIONS: Record<string, string> = {
  "can't": 'can not', "cannot": 'can not', "won't": 'will not', "shan't": 'shall not', "n't": ' not',
  "i'm": 'i am', "'re": ' are', "'s": ' is', "'ve": ' have', "'ll": ' will', "'d": ' would',
};

/**
 * Normalises English for comparing answers: case, punctuation and contractions don't matter, so
 * "Don't go!" equals "do not go".
 */
export function normalizeEnglish(s: string): string {
  let t = s.toLowerCase().replace(/[‘’]/g, "'");
  t = t.replace(/\bcan't\b/g, 'can not').replace(/\bcannot\b/g, 'can not').replace(/\bwon't\b/g, 'will not');
  t = t.replace(/\bi'm\b/g, 'i am');
  for (const [k, v] of Object.entries(CONTRACTIONS)) if (k.startsWith("'") || k.startsWith('n')) t = t.split(k).join(v);
  return t.replace(/[^a-z0-9%]+/g, ' ').trim();
}

/** Words that stay capitalised on tiles (so the capital letter doesn't give away the first word). */
export function properNouns(sentences: string[][]): Set<string> {
  const keep = new Set<string>(['I']);
  for (const tokens of sentences) {
    let first = true;
    for (const t of tokens) {
      if (!isEnglishWord(t)) {
        if (/[.!?:"]/.test(t)) first = true;
        continue;
      }
      if (!first && /^[A-Z]/.test(t) && !/^[A-Z]$/.test(t)) keep.add(t);
      first = false;
    }
  }
  return keep;
}

/** Lowercases a sentence-initial word unless it's a name, "I", or an all-caps word like RMB/OK. */
export function tileText(token: string, proper: Set<string>): string {
  if (!isEnglishWord(token) || proper.has(token) || /^[A-Z]{2,}$/.test(token) || /^[A-Z]\d/.test(token)) return token;
  return token.charAt(0).toLowerCase() + token.slice(1);
}

/** Puts English tokens back together with normal spacing. */
export function joinEnglish(tokens: string[]): string {
  let out = '';
  tokens.forEach((t, i) => {
    const prev = tokens[i - 1];
    const noSpaceBefore = /^[,.!?;:%)]$/.test(t) || (t === '"' && (out.match(/"/g)?.length ?? 0) % 2 === 1);
    const noSpaceAfterPrev = prev === '(' || (prev === '"' && (out.match(/"/g)?.length ?? 0) % 2 === 1);
    if (i > 0 && !noSpaceBefore && !noSpaceAfterPrev) out += ' ';
    out += t;
  });
  return out;
}
