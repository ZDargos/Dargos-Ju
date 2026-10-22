// Build step: turns every CSV in data/sentences/ into a level, splits sentences into words,
// and writes the app's sentence bundle plus a compact dictionary for the admin page.
//
// Word splits are computed once and cached in data/segmentation.json. Edit that file to fix
// a split by hand; the cached value always wins over the automatic segmenter.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSentenceCsv, sentenceId } from '../src/lib/csv.ts';
import { createRequire } from 'node:module';
import { fullEntries, parseCedict, segment, wordsOf, type DictEntry } from '../src/lib/segmenter.ts';
import { cleanEnglish, isEnglishWord, properNouns, tokenizeEnglish } from '../src/lib/english.ts';
import { fullEntry, lemmaOf, normalizeIpa, shortGloss, type EcdictEntry, type EnFullEntry } from '../src/lib/englishDict.ts';

const jieba = createRequire(import.meta.url)('jieba-wasm/node') as { cut(text: string, hmm: boolean): string[] };
const cut = (text: string) => jieba.cut(text, true);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sentencesDir = join(root, 'data', 'sentences');
const cachePath = join(root, 'data', 'segmentation.json');
const outPath = join(root, 'src', 'generated', 'sentences.json');
const dictOutPath = join(root, 'public', 'dict', 'cedict-lite.json');

const dictText = gunzipSync(readFileSync(join(root, 'data', 'dict', 'cedict_1_0_ts_utf-8_mdbg.txt.gz'))).toString('utf8');
const dict = parseCedict(dictText);

const cache: Record<string, string[]> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
let newlySegmented = 0;

const levels: { level: number; name: string; count: number }[] = [];
const sentences: { id: string; level: number; zh: string; en: string; tokens: string[]; enClean: string; enTokens: string[] }[] = [];

// English-learning mode uses proofread English (data/english-corrections.json, keyed by the Chinese
// sentence); anything not corrected there is cleaned automatically.
const corrections: Record<string, string> = JSON.parse(readFileSync(join(root, 'data', 'english-corrections.json'), 'utf8'));

const files = readdirSync(sentencesDir).filter((f) => f.toLowerCase().endsWith('.csv'));
for (const file of files) {
  const m = /(\d+)(?!.*\d)/.exec(file);
  if (!m) {
    console.warn(`Skipping ${file}: no level number in the file name (expected e.g. ..._LVL_20.csv)`);
    continue;
  }
  const level = Number(m[1]);
  const pairs = parseSentenceCsv(readFileSync(join(sentencesDir, file), 'utf8'));
  const seen = new Set<string>();
  for (const { zh, en } of pairs) {
    const id = sentenceId(level, zh);
    if (seen.has(id)) continue;
    seen.add(id);
    let tokens = cache[zh];
    if (!tokens) {
      tokens = segment(zh, dict, cut);
      cache[zh] = tokens;
      newlySegmented++;
    }
    const enClean = corrections[zh] ?? cleanEnglish(en);
    sentences.push({ id, level, zh, en, tokens, enClean, enTokens: tokenizeEnglish(enClean) });
  }
  levels.push({ level, name: `Level ${level}`, count: seen.size });
}
levels.sort((a, b) => a.level - b.level);
sentences.sort((a, b) => a.level - b.level);

// Lexicon: every word and every single character that appears, with pinyin and a short gloss.
const lexicon: Record<string, DictEntry> = {};
for (const s of sentences) {
  for (const w of wordsOf(s.tokens)) {
    for (const key of new Set([w, ...w])) {
      if (lexicon[key]) continue;
      const e = dict.get(key);
      if (e) lexicon[key] = e;
    }
  }
}

// English words: phonetics and a short Chinese meaning (ECDICT), plus each word's dictionary form.
const ecdict: Record<string, EcdictEntry> = JSON.parse(gunzipSync(readFileSync(join(root, 'data', 'dict', 'ecdict-subset.json.gz'))).toString('utf8'));
const enLexicon: Record<string, DictEntry> = {};
const enLemma: Record<string, string> = {};
const enFull: Record<string, EnFullEntry> = {};
for (const s of sentences) {
  for (const t of s.enTokens) {
    if (!isEnglishWord(t)) continue;
    const w = t.toLowerCase();
    if (enLexicon[w] || enLemma[w]) continue;
    const lemma = lemmaOf(w, ecdict);
    if (lemma !== w) enLemma[w] = lemma;
    const e = ecdict[w] ?? ecdict[lemma];
    if (e) enLexicon[w] = { py: normalizeIpa(e.ipa || ecdict[lemma]?.ipa || ''), en: shortGloss(e.zh) || shortGloss(ecdict[lemma]?.zh ?? []) };
    for (const key of new Set([w, lemma])) {
      const f = fullEntry(key, ecdict);
      if (f) enFull[key] = f;
    }
  }
}
const enProper = [...properNouns(sentences.map((s) => s.enTokens))];

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ levels, sentences, lexicon, enLexicon, enLemma, enProper }));
writeFileSync(join(dirname(outPath), 'en-dictionary.json'), JSON.stringify(enFull));

// Full dictionary entries (all readings and meanings) for the tap-a-word panel; loaded on demand.
const preferred = Object.fromEntries(Object.entries(lexicon).map(([w, e]) => [w, e.py]));
writeFileSync(join(dirname(outPath), 'dictionary.json'), JSON.stringify(fullEntries(dictText, new Set(Object.keys(lexicon)), preferred)));

// Sorted, one entry per line, so manual edits and diffs stay readable.
const sortedKeys = Object.keys(cache).sort();
writeFileSync(
  cachePath,
  '{\n' + sortedKeys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(cache[k])}`).join(',\n') + '\n}\n',
);

// Compact dictionary (words up to 4 characters) for segmenting sentences added in the admin page.
mkdirSync(dirname(dictOutPath), { recursive: true });
const lite: Record<string, [string, string]> = {};
for (const [w, e] of dict) if (w.length <= 4) lite[w] = [e.py, e.en.slice(0, 60)];
writeFileSync(dictOutPath, JSON.stringify(lite));

// Compact English dictionary for English sentences added in the admin page.
const enLite: Record<string, [string, string, string]> = {};
for (const [w, e] of Object.entries(ecdict)) enLite[w] = [normalizeIpa(e.ipa), shortGloss(e.zh), lemmaOf(w, ecdict)];
writeFileSync(join(dirname(dictOutPath), 'ecdict-lite.json'), JSON.stringify(enLite));

console.log(
  `Sentences: ${sentences.length} in ${levels.length} levels (${levels.map((l) => l.level).join(', ')}); ` +
    `${newlySegmented} newly segmented; lexicon ${Object.keys(lexicon).length} entries; English words ${Object.keys(enLexicon).length}.`,
);
