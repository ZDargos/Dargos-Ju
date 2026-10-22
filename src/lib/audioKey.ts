// Names for pre-made sentence audio, shared by the generator (scripts/make-audio.ts) and the app.
// A sentence's audio lives at public/audio/<lang>/<key>.mp3, where the key is a hash of the exact
// text the app speaks, so edited sentences get new audio automatically. No imports: Node uses it too.

export type AudioLang = 'zh' | 'en';

/** Sentences that aren't in the CSVs but are spoken by the app (the Settings speed test). */
export const SAMPLE_SENTENCES: Record<AudioLang, string> = { zh: '我们一起学习中文吧！', en: "Let's learn English together!" };

/** 64-bit FNV-1a of `lang|text`, as 16 hex characters. */
export function audioKey(lang: AudioLang, text: string): string {
  const s = `${lang}|${text.trim()}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193 ^ 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
