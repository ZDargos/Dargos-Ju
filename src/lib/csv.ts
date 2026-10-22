// Minimal RFC 4180 CSV parsing for "Chinese,English" sentence files.

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

export interface SentencePair {
  zh: string;
  en: string;
}

/** Parses a sentence CSV. A "Chinese,English" header row is skipped if present. */
export function parseSentenceCsv(text: string): SentencePair[] {
  const rows = parseCsv(text);
  if (rows.length && /^chinese$/i.test(rows[0][0]?.trim() ?? '')) rows.shift();
  return rows
    .map((r) => ({ zh: (r[0] ?? '').trim(), en: r.slice(1).join(',').trim() }))
    .filter((p) => p.zh && p.en);
}

/** Stable short id from text (FNV-1a, base36). */
export function hashId(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const sentenceId = (level: number, zh: string) => `${level}-${hashId(zh)}`;
