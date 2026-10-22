// ECDICT (English–Chinese) helpers shared by the build script and the admin page.
import { msg } from '../i18n/msg.ts';

/** One ECDICT entry as stored in data/dict/ecdict-subset.json.gz. */
export interface EcdictEntry {
  ipa: string;
  zh: string[];
  /** Word forms, e.g. "p:went/d:gone/i:going/3:goes" or "0:go/1:p" for an inflected form. */
  x: string;
  rank: number;
}

/** A full entry for the tap-a-word panel in English mode. */
export interface EnFullEntry {
  word: string;
  ipa: string;
  zh: string[];
  forms: { label: string; word: string }[];
}

// English labels; the app translates them with t().
const FORM_LABELS: Record<string, string> = {
  p: msg('past tense'),
  d: msg('past participle'),
  i: msg('present participle'),
  '3': msg('third person'),
  s: msg('plural'),
  r: msg('comparative'),
  t: msg('superlative'),
};

/** ECDICT phonetics use a mix of old notations; tidy them into standard IPA between slashes. */
export function normalizeIpa(raw: string): string {
  if (!raw) return '';
  const s = raw
    .replace(/ә/g, 'ə') // Cyrillic schwa
    .replace(/:/g, 'ː')
    .replace(/'/g, 'ˈ')
    .replace(/,/g, 'ˌ')
    .replace(/\^/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `/${s}/`;
}

/** Shortest useful Chinese gloss: the first sense line without its part-of-speech prefix. */
export function shortGloss(zh: string[]): string {
  const first = zh[0] ?? '';
  return first
    .replace(/^[a-z]+\.\s*/i, '')
    .replace(/[(（][^)）]*[)）]/g, '')
    .split(/[,，;；]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('；');
}

/** The dictionary form of a word: "went" → "go", "son's" → "son". */
export function lemmaOf(word: string, dict: Record<string, EcdictEntry>): string {
  let w = word.toLowerCase().replace(/[‘’]/g, "'");
  if (w.endsWith("'s") && !dict[w]) w = w.slice(0, -2);
  const e = dict[w];
  const base = e?.x.split('/').find((p) => p.startsWith('0:'))?.slice(2);
  return base && dict[base] ? base : w;
}

export function fullEntry(word: string, dict: Record<string, EcdictEntry>): EnFullEntry | null {
  const e = dict[word];
  if (!e) return null;
  const forms = e.x
    .split('/')
    .map((p) => p.split(':'))
    .filter(([k, v]) => v && FORM_LABELS[k])
    .map(([k, v]) => ({ label: FORM_LABELS[k], word: v }));
  return { word, ipa: normalizeIpa(e.ipa), zh: e.zh, forms };
}
