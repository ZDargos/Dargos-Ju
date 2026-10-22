// Makes natural-sounding audio for every sentence with Azure neural voices (free tier), so the app
// doesn't depend on each phone's text-to-speech. Run after `npm run sentences`:
//   AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=eastus node scripts/make-audio.ts [--limit 120]
// The GitHub workflow .github/workflows/audio.yml runs it whenever sentences change.
//
// - Files: public/audio/<lang>/<key>.mp3 (key from src/lib/audioKey.ts). Only missing or outdated
//   files are made, so re-running is cheap.
// - data/audio-manifest.json records each file's text, voice and source. Entries with
//   source "human" are native-speaker recordings that replaced the neural audio: never overwritten.
// - Dialogue ("A: ... B: ...") uses a different voice for each speaker.
// - Prints "more" when --limit stopped it early, so the workflow can commit and continue.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audioKey, SAMPLE_SENTENCES, type AudioLang } from '../src/lib/audioKey.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'data', 'audio-manifest.json');

/** Voices per language: speaker A (and plain sentences), speaker B. Changing these remakes all neural audio. */
const VOICES: Record<AudioLang, { locale: string; a: string; b: string }> = {
  zh: { locale: 'zh-CN', a: 'zh-CN-XiaoxiaoNeural', b: 'zh-CN-YunxiNeural' },
  en: { locale: 'en-US', a: 'en-US-AvaNeural', b: 'en-US-AndrewNeural' },
};
const FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
// The free tier allows 20 requests a minute.
const GAP_MS = 3100;

interface ManifestEntry {
  lang: AudioLang;
  text: string;
  /** "neural" (generated) or "human" (a reviewed native-speaker recording). */
  source: 'neural' | 'human';
  voice: string;
}

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;

const manifest: Record<string, ManifestEntry> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const { sentences } = JSON.parse(readFileSync(join(root, 'src', 'generated', 'sentences.json'), 'utf8')) as {
  sentences: { zh: string; enClean: string }[];
};

// Everything the app speaks: each sentence in both languages, plus the samples.
const wanted = new Map<string, { lang: AudioLang; text: string }>();
const want = (lang: AudioLang, text: string) => wanted.set(audioKey(lang, text), { lang, text: text.trim() });
for (const s of sentences) {
  want('zh', s.zh);
  want('en', s.enClean);
}
for (const [lang, text] of Object.entries(SAMPLE_SENTENCES) as [AudioLang, string][]) want(lang, text);

const voiceLabel = (lang: AudioLang) => `${VOICES[lang].a}+${VOICES[lang].b}`;
const fileOf = (lang: AudioLang, k: string) => join(root, 'public', 'audio', lang, `${k}.mp3`);

const todo = [...wanted].filter(([k, w]) => {
  const m = manifest[k];
  if (m?.source === 'human') return false;
  return !m || m.voice !== voiceLabel(w.lang) || !existsSync(fileOf(w.lang, k));
});

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** SSML for a sentence; dialogue lines get alternating voices and the "A:" labels aren't read. */
function ssml(lang: AudioLang, text: string): string {
  const v = VOICES[lang];
  const labels = [...text.matchAll(/(?:^|(?<=[.!?。！？…"”]))\s*([A-Z])\s*[:：]\s*/g)];
  const lines: { voice: string; text: string }[] =
    labels.length && labels[0].index === 0
      ? labels.map((m, i) => ({
          voice: m[1] === 'B' ? v.b : v.a,
          text: text.slice(m.index! + m[0].length, labels[i + 1]?.index ?? text.length),
        }))
      : [{ voice: v.a, text }];
  const body = lines
    .filter((l) => l.text.trim())
    .map((l) => `<voice name="${l.voice}">${escapeXml(l.text.trim())}</voice>`)
    .join('');
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${v.locale}">${body}</speak>`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function synthesize(lang: AudioLang, text: string): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key!,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': FORMAT,
        'User-Agent': 'dargos-ju-audio',
      },
      body: ssml(lang, text),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await sleep(Number(res.headers.get('retry-after') ?? 0) * 1000 || 15000);
      continue;
    }
    throw new Error(`Azure TTS ${res.status}: ${await res.text()} (${lang}: ${text})`);
  }
}

function saveManifest() {
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(manifestPath, JSON.stringify(sorted, null, 1) + '\n');
}

console.log(`${wanted.size} sentences need audio; ${todo.length} missing or outdated.`);
if (process.argv.includes('--dry-run')) {
  const dialogue = [...wanted.values()].find((w) => /^A[:：]/.test(w.text));
  if (dialogue) console.log(ssml(dialogue.lang, dialogue.text));
  process.exit(0);
}
if (todo.length && (!key || !region)) {
  console.log('AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set; skipping. The app falls back to device speech.');
  process.exit(0);
}
let made = 0;
for (const [k, w] of todo) {
  if (made >= limit) break;
  const audio = await synthesize(w.lang, w.text);
  mkdirSync(dirname(fileOf(w.lang, k)), { recursive: true });
  writeFileSync(fileOf(w.lang, k), audio);
  manifest[k] = { lang: w.lang, text: w.text, source: 'neural', voice: voiceLabel(w.lang) };
  made++;
  if (made % 20 === 0) {
    saveManifest();
    console.log(`  ${made}/${Math.min(todo.length, limit)}`);
  }
  await sleep(GAP_MS);
}
saveManifest();
console.log(`Made ${made} audio files.`);
if (made < todo.length) console.log('more');
