// Chinese word segmentation shared by the build script (Node) and the admin page (browser).
// Strategy: jieba gives a first pass, then CC-CEDICT checks it: any token the dictionary
// doesn't know (很大, 坐飞机, 中国政府) is re-split by forward maximum matching, so the
// tracked vocabulary stays made of real dictionary words.

const HAN = /\p{Script=Han}/u;
const HAN_ONLY = /^\p{Script=Han}+$/u;
const PUNCT_OR_SPACE = /^[\s\p{P}\p{S}]+$/u;

export const hasHan = (s: string) => HAN.test(s);
export const isHanWord = (s: string) => HAN_ONLY.test(s);
export const isPunctuation = (s: string) => PUNCT_OR_SPACE.test(s);

export interface WordDict {
  has(word: string): boolean;
}

/** A first-pass segmenter, e.g. jieba's cut(text, true). */
export type Cutter = (text: string) => string[];

const MAX_MATCH = 4;

function forwardMaxMatch(text: string, dict: WordDict): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let len = Math.min(MAX_MATCH, text.length - i);
    while (len > 1 && !dict.has(text.slice(i, i + len))) len--;
    out.push(text.slice(i, i + len));
    i += len;
  }
  return out;
}

/** Splits a Chinese sentence into tokens. Joining the tokens gives back the sentence minus whitespace. */
export function segment(text: string, dict: WordDict, cut: Cutter): string[] {
  const tokens: string[] = [];
  for (const t of cut(text)) {
    if (/^\s*$/u.test(t)) continue;
    if (isHanWord(t) && t.length > 1 && !dict.has(t)) tokens.push(...forwardMaxMatch(t, dict));
    else tokens.push(t.trim());
  }
  // jieba often splits suffixed compounds (中国|人, 休息|日); rejoin two-plus-one pairs the dictionary knows.
  for (let i = 0; i + 1 < tokens.length; i++) {
    const [a, b] = [tokens[i], tokens[i + 1]];
    if (a.length === 2 && b.length === 1 && isHanWord(a) && isHanWord(b) && dict.has(a + b)) tokens.splice(i, 2, a + b);
  }
  return tokens;
}

/** Han-only tokens: these are the vocabulary words tracked for difficulty. */
export const wordsOf = (tokens: string[]) => tokens.filter(isHanWord);

// ---- CC-CEDICT parsing ----

export interface DictEntry {
  /** Pinyin with tone marks, e.g. "miàn bāo". */
  py: string;
  /** Short English gloss. */
  en: string;
}

const TONES: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à', 'a'],
  e: ['ē', 'é', 'ě', 'è', 'e'],
  i: ['ī', 'í', 'ǐ', 'ì', 'i'],
  o: ['ō', 'ó', 'ǒ', 'ò', 'o'],
  u: ['ū', 'ú', 'ǔ', 'ù', 'u'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
};

function syllableToMarks(syl: string): string {
  const m = /^([a-zü:]+)([1-5])$/i.exec(syl);
  if (!m) return syl.replace(/u:/g, 'ü');
  const base = m[1].replace(/u:/gi, 'ü');
  const tone = Number(m[2]) - 1;
  const lower = base.toLowerCase();
  let idx = lower.search(/[ae]/);
  if (idx < 0) idx = lower.indexOf('ou');
  if (idx < 0) {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ('aeiouü'.includes(lower[i])) { idx = i; break; }
    }
  }
  if (idx < 0) return base;
  const v = lower[idx];
  const marked = TONES[v]?.[tone] ?? v;
  const out = base.slice(0, idx) + (base[idx] === v ? marked : marked.toUpperCase()) + base.slice(idx + 1);
  return out;
}

export const numberedToMarks = (py: string) => py.split(' ').map(syllableToMarks).join(' ');

function shortGloss(defs: string[]): string {
  const useful = defs.filter(
    (d) => !/^(surname |variant of |old variant of |see |CL:|abbr\. for |used in )/i.test(d),
  );
  const chosen = (useful.length ? useful : defs).slice(0, 3);
  return chosen.join('; ').replace(/\|[^\s\[]+/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s*\([^()]*pr\.\s*\)/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Parses CC-CEDICT text into a simplified-headword map. When a word has several entries, the
 * first ordinary entry wins over cross-references ("see 上聲") and proper nouns like surnames.
 */
/** Most common reading for single characters with several pronunciations. */
const PREFERRED_READING: Record<string, string> = {
  着: 'zhe5', 行: 'xing2', 要: 'yao4', 为: 'wei4', 得: 'de5', 差: 'cha4', 觉: 'jue2', 便: 'bian4', 种: 'zhong3',
  发: 'fa1', 重: 'zhong4', 数: 'shu4', 少: 'shao3', 教: 'jiao4', 空: 'kong1', 乐: 'le4', 处: 'chu4', 干: 'gan4',
  调: 'diao4', 倒: 'dao4', 相: 'xiang1', 只: 'zhi3', 了: 'le5', 还: 'hai2', 长: 'chang2', 都: 'dou1', 地: 'de5',
  和: 'he2', 哪: 'na3', 那: 'na4', 什: 'shen2', 么: 'me5', 儿: 'er2', 会: 'hui4', 看: 'kan4', 没: 'mei2',
};

export function parseCedict(text: string, maxLen = 6): Map<string, DictEntry> {
  const map = new Map<string, DictEntry & { rank: number }>();
  const line = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/;
  const reference = /^(see |see also |variant of |old variant of |used in |erhua variant of |\(old\) )/i;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw.startsWith('#')) continue;
    const m = line.exec(raw);
    if (!m) continue;
    const simp = m[2];
    if (simp.length > maxLen || !hasHan(simp)) continue;
    const pyNum = m[3];
    const defs = m[4].split('/');
    // Lower is better: preferred reading, then ordinary words over proper nouns, then real glosses over cross-references.
    const rank =
      (PREFERRED_READING[simp] === pyNum.toLowerCase() ? -10 : 0) + (/^[A-Z]/.test(pyNum) ? 4 : 0) + (defs.every((d) => reference.test(d)) ? 1 : 0);
    const existing = map.get(simp);
    if (existing && existing.rank <= rank) continue;
    map.set(simp, { py: numberedToMarks(pyNum.toLowerCase()), en: shortGloss(defs), rank });
  }
  const out = new Map<string, DictEntry>();
  for (const [k, v] of map) out.set(k, { py: v.py, en: v.en });
  return out;
}

/** One reading of a word with all of its meanings, for the dictionary panel. */
export interface FullEntry {
  py: string;
  defs: string[];
}

/** Makes CC-CEDICT cross-references readable: "see 上聲|上声[shang3 sheng1]" → "see 上声 (shàng shēng)". */
export function cleanDefinition(def: string): string {
  return def
    .replace(/(\S+?)\|(\S+?)\[([^\]]+)\]/g, (_m, _t, simp, py) => `${simp} (${numberedToMarks(py.toLowerCase())})`)
    .replace(/(\S+?)\[([^\]]+)\]/g, (_m, word, py) => `${word} (${numberedToMarks(py.toLowerCase())})`)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every reading and meaning for the given words, most common reading first. */
export function fullEntries(text: string, words: Set<string>, preferredPy: Record<string, string>): Record<string, FullEntry[]> {
  const out: Record<string, (FullEntry & { proper: boolean })[]> = {};
  const line = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw.startsWith('#')) continue;
    const m = line.exec(raw);
    if (!m || !words.has(m[2])) continue;
    const py = numberedToMarks(m[3].toLowerCase());
    const defs = m[4].split('/').filter((d) => d && !/^CL:/.test(d)).map(cleanDefinition);
    const list = (out[m[2]] ??= []);
    const same = list.find((e) => e.py === py);
    if (same) same.defs.push(...defs.filter((d) => !same.defs.includes(d)));
    else list.push({ py, defs, proper: /^[A-Z]/.test(m[3]) });
  }
  const result: Record<string, FullEntry[]> = {};
  for (const [w, list] of Object.entries(out)) {
    list.sort((a, b) => Number(b.py === preferredPy[w]) - Number(a.py === preferredPy[w]) || Number(a.proper) - Number(b.proper));
    result[w] = list.map(({ py, defs }) => ({ py, defs }));
  }
  return result;
}
