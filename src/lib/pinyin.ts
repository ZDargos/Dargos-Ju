// Pinyin helpers: checking typed pinyin (tone numbers or tone marks, spaces optional, v for ü)
// and turning dictionary pinyin into the form Azure's speech engine uses to say a reading.
// No imports: the audio script uses it too.

const MARKS: Record<string, [string, number]> = {};
for (const [base, marked] of Object.entries({ a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' }))
  [...marked].forEach((ch, i) => (MARKS[ch] = [base, i + 1]));

/** Letters (tone marks removed, ü as v) and the tones in order; neutral tones (5, 0 or none) are left out. */
function split(input: string): { letters: string; tones: string } {
  let letters = '';
  let tones = '';
  for (const ch of input.normalize('NFC').toLowerCase()) {
    if (MARKS[ch]) {
      letters += MARKS[ch][0] === 'ü' ? 'v' : MARKS[ch][0];
      tones += MARKS[ch][1];
    } else if (/[1-4]/.test(ch)) tones += ch;
    else if (ch === 'ü') letters += 'v';
    else if (/[a-z]/.test(ch)) letters += ch;
    // spaces, apostrophes, hyphens, 5 and 0 (neutral tone) don't matter
  }
  return { letters: letters.replace(/u:/g, 'v'), tones };
}

/** Whether typed pinyin matches the expected reading, tones included. */
export function pinyinMatches(typed: string, expected: string): boolean {
  const a = split(typed.replace(/u:/gi, 'v'));
  const b = split(expected);
  return a.letters.length > 0 && a.letters === b.letters && a.tones === b.tones;
}

/** Whether typed pinyin has the right letters but wrong or missing tones (for feedback). */
export function pinyinLettersMatch(typed: string, expected: string): boolean {
  return split(typed.replace(/u:/gi, 'v')).letters === split(expected).letters;
}

/** Dictionary pinyin ("nǐ hǎo") as tone numbers for Azure SSML phonemes ("ni 3 hao 3"); null if unsure. */
export function toSapi(py: string): string | null {
  const syllables = py.trim().split(/\s+/);
  const out: string[] = [];
  for (const syl of syllables) {
    const { letters, tones } = split(syl);
    if (!/^[a-z]+$/.test(letters) || tones.length > 1) return null;
    out.push(`${letters} ${tones || '5'}`);
  }
  return out.join(' ');
}
