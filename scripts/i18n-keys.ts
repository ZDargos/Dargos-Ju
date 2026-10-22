// Finds every interface string in src (the first argument of t('...') and msg('...')) and
// reports the ones that have no Chinese translation in src/i18n/zh.ts.
//   node scripts/i18n-keys.ts            lists missing keys as JSON
// The same check runs as a unit test, so a new string without a translation fails the build.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'generated' ? [] : files(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !p.includes(join('i18n', 'zh.ts')) ? [p] : [];
  });
}

const CALL = /(?<![\w.$])(?:t|msg)\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\$]|\\.)*`)/g;

function unquote(lit: string): string {
  const body = lit.slice(1, -1);
  return body.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c));
}

/** Every literal interface string, with the files it appears in. */
export function extractKeys(): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  for (const f of files(SRC)) {
    // Comment lines are skipped, so examples in doc comments don't count.
    const text = readFileSync(f, 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
      .join('\n');
    for (const m of text.matchAll(CALL)) {
      const key = unquote(m[1]);
      keys.set(key, [...(keys.get(key) ?? []), f.slice(SRC.length + 1)]);
    }
  }
  return keys;
}

export function missingKeys(zh: Record<string, string>): string[] {
  return [...extractKeys().keys()].filter((k) => !(k in zh)).sort();
}

/** Placeholders like {n} must survive translation. */
export function placeholderMismatches(zh: Record<string, string>): string[] {
  const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  return Object.entries(zh).filter(([k, v]) => names(k) !== names(v)).map(([k]) => k);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const zh = (await import('../src/i18n/zh.ts')).default as Record<string, string>;
  const keys = extractKeys();
  const unused = Object.keys(zh).filter((k) => !keys.has(k));
  console.log(JSON.stringify({ total: keys.size, missing: missingKeys(zh), unused, placeholderMismatches: placeholderMismatches(zh) }, null, 1));
}
