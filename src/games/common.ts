import { shuffle } from '../lib/srs';
import { isLabel, type LangOps } from '../lib/learn';

export const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export type MutationKind = 'replace' | 'extra' | 'missing' | 'swap';

export interface Mutation {
  kind: MutationKind;
  tokens: string[];
  /** replace/extra: index of the wrong token in `tokens`; missing: gap index (token is missing before this index); swap: first of the two swapped tokens. */
  index: number;
  /** The word that was replaced/removed, for feedback. */
  original?: string;
}

/** Keeps a replacement's capital letter if the original word had one ("The" → "A"). */
function matchCase(original: string, replacement: string): string {
  return /^[A-Z]/.test(original) && /^[a-z]/.test(replacement) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

/** Makes one realistic mistake in a sentence; the result always reads differently from the original. */
export function mutate(tokens: string[], vocab: string[], ops: LangOps, kinds: MutationKind[] = ['replace', 'extra', 'missing']): Mutation | null {
  const key = (w: string) => (ops.lang === 'en' ? w.toLowerCase() : w);
  const confusableOf = new Map<string, string[]>();
  for (const g of ops.confusables) for (const w of g) confusableOf.set(w, g.filter((x) => x !== w));
  const wordIndexes = tokens.map((t, i) => (ops.isWord(t) ? i : -1)).filter((i) => i >= 0);

  const replace = (): Mutation | null => {
    const confusable = wordIndexes.filter((i) => confusableOf.has(key(tokens[i])));
    const i = confusable.length && Math.random() < 0.8 ? pick(confusable) : wordIndexes.length ? pick(wordIndexes) : -1;
    if (i < 0) return null;
    const w = tokens[i];
    let alt = confusableOf.has(key(w)) ? pick(confusableOf.get(key(w))!) : undefined;
    if (!alt) {
      const same = vocab.filter((v) => (ops.lang === 'en' ? Math.abs(v.length - w.length) <= 2 : v.length === w.length) && key(v) !== key(w));
      if (!same.length) return null;
      alt = pick(same);
    }
    const next = tokens.slice();
    next[i] = matchCase(w, alt);
    return { kind: 'replace', tokens: next, index: i, original: w };
  };

  const extra = (): Mutation | null => {
    const positions = tokens.map((_, i) => i).filter((i) => i > 0 && ops.isTile(tokens[i - 1]) && ops.isTile(tokens[i] ?? ''));
    if (!positions.length) return null;
    const at = pick(positions);
    const word = pick(ops.particles.filter((p) => key(p) !== key(tokens[at - 1]) && key(p) !== key(tokens[at])));
    return { kind: 'extra', tokens: [...tokens.slice(0, at), word, ...tokens.slice(at)], index: at };
  };

  const missing = (): Mutation | null => {
    if (wordIndexes.length < 3) return null;
    const idx = wordIndexes.filter((i) => i > 0 || tokens.length > 3);
    const small = idx.filter((i) => ops.particles.includes(key(tokens[i])) || (ops.lang === 'zh' ? tokens[i].length === 1 : tokens[i].length <= 3));
    const i = small.length && Math.random() < 0.7 ? pick(small) : idx.length ? pick(idx) : -1;
    if (i < 0) return null;
    return { kind: 'missing', tokens: [...tokens.slice(0, i), ...tokens.slice(i + 1)], index: i, original: tokens[i] };
  };

  const swap = (): Mutation | null => {
    const pairs = tokens
      .map((_, i) => i)
      .filter((i) => i + 1 < tokens.length && ops.isWord(tokens[i]) && ops.isWord(tokens[i + 1]) && key(tokens[i]) !== key(tokens[i + 1]));
    if (!pairs.length) return null;
    const i = pick(pairs);
    const next = tokens.slice();
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    return { kind: 'swap', tokens: next, index: i };
  };

  // English capitals follow the new word order: "What opinions..." swapped reads "Opinions what...".
  const starts = (toks: string[]) => {
    const out = new Set<number>();
    let start = true;
    toks.forEach((t, i) => {
      if (ops.isWord(t)) {
        if (start) out.add(i);
        start = false;
      } else if (/[.!?]$/.test(t) || isLabel(t)) start = true;
    });
    return out;
  };
  const recase = (next: string[]): string[] => {
    if (ops.lang !== 'en') return next;
    const wasFirst = new Set([...starts(tokens)].map((i) => tokens[i]));
    const first = starts(next);
    return next.map((t, i) => {
      if (!ops.isWord(t)) return t;
      if (first.has(i)) return t[0].toUpperCase() + t.slice(1);
      if (wasFirst.has(t) && /^[A-Z][a-z]/.test(t)) return t[0].toLowerCase() + t.slice(1);
      return t;
    });
  };

  const original = ops.normalize(ops.join(tokens));
  for (const kind of shuffle(kinds).concat(shuffle(kinds))) {
    const m = kind === 'replace' ? replace() : kind === 'extra' ? extra() : kind === 'missing' ? missing() : swap();
    if (m && ops.normalize(ops.join(m.tokens)) !== original) return { ...m, tokens: recase(m.tokens) };
  }
  return null;
}

/** Distinct vocabulary words across a set of sentences' tokens. */
export const vocabOf = (tokenLists: string[][], ops: LangOps) => [...new Set(tokenLists.flatMap((t) => t.filter(ops.isWord)))];

export interface Tile {
  id: number;
  text: string;
}

export const makeTiles = (words: string[]): Tile[] => shuffle(words.map((text, id) => ({ id, text })));
