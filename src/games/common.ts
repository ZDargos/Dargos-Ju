import { isHanWord, isPunctuation } from '../lib/segmenter';
import { shuffle } from '../lib/srs';
import type { Sentence } from '../types';

/** Tokens a player moves around: everything except punctuation. */
export const tilesOf = (s: Sentence) => s.tokens.filter((t) => !isPunctuation(t));

export const normalize = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '');

export const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Groups of words learners mix up; used to make wrong answers that differ by one detail. */
const CONFUSABLE: string[][] = [
  ['了', '过', '着'],
  ['不', '没'],
  ['的', '得', '地'],
  ['在', '再'],
  ['会', '能', '可以'],
  ['吗', '呢', '吧'],
  ['很', '太', '真'],
  ['又', '再', '还'],
  ['也', '都'],
  ['就', '才'],
  ['和', '跟'],
  ['想', '要'],
  ['去', '来'],
  ['上', '下'],
  ['前', '后'],
  ['多', '少'],
  ['大', '小'],
  ['这', '那'],
  ['他', '她'],
  ['个', '只', '张', '本', '把', '块', '杯', '台', '件'],
  ['我', '你'],
  ['有', '是'],
  ['往', '从', '向'],
  ['一点', '有点'],
  ['以上', '以下', '以内'],
  ['回来', '回去'],
  ['上来', '下来', '上去', '下去'],
  ['今天', '明天', '昨天'],
  ['早上', '下午', '晚上'],
  ['东边', '西边'],
  ['认为', '以为'],
  ['可是', '但是'],
  ['最', '更'],
  ['这儿', '那儿', '哪儿'],
  ['这个', '那个', '哪个'],
  ['什么', '怎么'],
  ['几', '多少'],
  ['还是', '或者'],
  ['看', '见', '听'],
  ['说', '讲', '告诉'],
  ['知道', '认识'],
];
const confusableOf = new Map<string, string[]>();
for (const g of CONFUSABLE) for (const w of g) confusableOf.set(w, g.filter((x) => x !== w));

/** Small words that are easy to add or drop by mistake. */
const PARTICLES = ['了', '的', '很', '都', '也', '在', '不', '着', '过', '吧', '就', '还', '是'];

export type MutationKind = 'replace' | 'extra' | 'missing' | 'swap';

export interface Mutation {
  kind: MutationKind;
  tokens: string[];
  /** replace/extra: index of the wrong token in `tokens`; missing: gap index (token is missing before this index); swap: first of the two swapped tokens. */
  index: number;
  /** The word that was replaced/removed, for feedback. */
  original?: string;
}

const hanIndexes = (tokens: string[]) => tokens.map((t, i) => (isHanWord(t) ? i : -1)).filter((i) => i >= 0);

function replace(tokens: string[], vocab: string[]): Mutation | null {
  const idx = hanIndexes(tokens);
  const confusable = idx.filter((i) => confusableOf.has(tokens[i]));
  const i = confusable.length && Math.random() < 0.8 ? pick(confusable) : idx.length ? pick(idx) : -1;
  if (i < 0) return null;
  const w = tokens[i];
  let alt = confusableOf.has(w) ? pick(confusableOf.get(w)!) : undefined;
  if (!alt) {
    const same = vocab.filter((v) => v.length === w.length && v !== w);
    if (!same.length) return null;
    alt = pick(same);
  }
  const next = tokens.slice();
  next[i] = alt;
  return { kind: 'replace', tokens: next, index: i, original: w };
}

function extra(tokens: string[]): Mutation | null {
  const positions = tokens.map((_, i) => i).filter((i) => i > 0 && !isPunctuation(tokens[i - 1]) && !isPunctuation(tokens[i] ?? ''));
  if (!positions.length) return null;
  const at = pick(positions);
  const particle = pick(PARTICLES.filter((p) => p !== tokens[at - 1] && p !== tokens[at]));
  const next = [...tokens.slice(0, at), particle, ...tokens.slice(at)];
  return { kind: 'extra', tokens: next, index: at };
}

function missing(tokens: string[]): Mutation | null {
  const idx = hanIndexes(tokens).filter((i) => i > 0 || tokens.length > 3);
  const particles = idx.filter((i) => PARTICLES.includes(tokens[i]) || tokens[i].length === 1);
  const i = particles.length && Math.random() < 0.7 ? pick(particles) : idx.length ? pick(idx) : -1;
  if (i < 0 || hanIndexes(tokens).length < 3) return null;
  return { kind: 'missing', tokens: [...tokens.slice(0, i), ...tokens.slice(i + 1)], index: i, original: tokens[i] };
}

function swap(tokens: string[]): Mutation | null {
  const pairs = tokens
    .map((_, i) => i)
    .filter((i) => i + 1 < tokens.length && isHanWord(tokens[i]) && isHanWord(tokens[i + 1]) && tokens[i] !== tokens[i + 1]);
  if (!pairs.length) return null;
  const i = pick(pairs);
  const next = tokens.slice();
  [next[i], next[i + 1]] = [next[i + 1], next[i]];
  return { kind: 'swap', tokens: next, index: i };
}

/** Makes one realistic mistake in a sentence; the result always reads differently from the original. */
export function mutate(tokens: string[], vocab: string[], kinds: MutationKind[] = ['replace', 'extra', 'missing']): Mutation | null {
  const original = normalize(tokens.join(''));
  for (const kind of shuffle(kinds).concat(shuffle(kinds))) {
    const m = kind === 'replace' ? replace(tokens, vocab) : kind === 'extra' ? extra(tokens) : kind === 'missing' ? missing(tokens) : swap(tokens);
    if (m && normalize(m.tokens.join('')) !== original) return m;
  }
  return null;
}

export const joinTokens = (tokens: string[]) => {
  // Re-insert spaces only between Latin/number tokens so "A380" and "OK" stay readable.
  let out = '';
  tokens.forEach((t, i) => {
    if (i > 0 && /[A-Za-z0-9]$/.test(tokens[i - 1]) && /^[A-Za-z0-9]/.test(t)) out += ' ';
    out += t;
  });
  return out;
};

export interface Tile {
  id: number;
  text: string;
}

export const makeTiles = (words: string[]): Tile[] => shuffle(words.map((text, id) => ({ id, text })));
