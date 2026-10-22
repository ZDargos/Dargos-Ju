// Text-to-speech for the language being learned (Chinese, or English in English-learning mode).
// - Android app: a small native plugin (ZhSpeechPlugin.java) that prefers Google's speech engine,
//   since many phones default to an engine with no Chinese voice.
// - Web: the browser's speechSynthesis, using a voice for the right language only. Without one,
//   browsers read Chinese with an English voice, which skips the characters and plays silence,
//   so we refuse and explain how to get a voice instead.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { t } from '../i18n';
import type { LearnLang } from './learn';

interface NativeStatus {
  ready: boolean;
  engine: string | null;
  googleInstalled: boolean;
  chinese: boolean;
  english: boolean;
  missingData: boolean;
}

interface ZhSpeechPlugin {
  status(): Promise<NativeStatus>;
  speak(options: { text: string; rate: number; lang: LearnLang }): Promise<void>;
  stop(): Promise<void>;
  installVoice(): Promise<void>;
  openSettings(): Promise<void>;
}

const ZhSpeech = registerPlugin<ZhSpeechPlugin>('ZhSpeech');
const native = Capacitor.isNativePlatform();

export class NoVoiceError extends Error {
  constructor(public lang: LearnLang) {
    super(
      lang === 'zh'
        ? t('No Chinese voice is installed on this device. See Settings → Audio to fix it.')
        : t('No English voice is installed on this device. See Settings → Audio to fix it.'),
    );
  }
}

export interface VoiceStatus {
  available: boolean;
  detail: string;
  actions: { label: string; run: () => void }[];
}

function loadVoices(timeout = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, timeout);
  });
}

function pickVoice(voices: SpeechSynthesisVoice[], lang: LearnLang): SpeechSynthesisVoice | undefined {
  if (lang === 'en') {
    const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
    const us = en.filter((v) => /US|GB/i.test(v.lang));
    const pool = us.length ? us : en;
    return pool.find((v) => /natural|online|google/i.test(v.name)) ?? pool.find((v) => v.default) ?? pool[0];
  }
  const zh = voices.filter((v) => /^(zh|cmn)([-_](CN|Hans|Hans[-_]CN))?$/i.test(v.lang));
  const mainland = zh.filter((v) => /CN|Hans/i.test(v.lang) || v.lang.toLowerCase() === 'zh');
  const pool = mainland.length ? mainland : zh;
  return pool.find((v) => /natural|online|google/i.test(v.name)) ?? pool[0];
}

export function ttsAvailable(): boolean {
  return native || (typeof window !== 'undefined' && 'speechSynthesis' in window);
}

export async function voiceStatus(lang: LearnLang): Promise<VoiceStatus> {
  const name = lang === 'zh' ? t('Chinese') : t('English');
  if (native) {
    const s = await ZhSpeech.status();
    const ready = lang === 'zh' ? s.chinese : s.english;
    if (ready)
      return {
        available: true,
        detail: t('{lang} voice ready ({engine} speech engine).', { lang: name, engine: s.engine === 'com.google.android.tts' ? 'Google' : s.engine ?? t('system') }),
        actions: [],
      };
    if (!s.googleInstalled)
      return {
        available: false,
        detail: t('Your phone has no {lang} voice. Install "Speech Services by Google" from the Play Store, then download its {lang} voice.', { lang: name }),
        actions: [{ label: t('Open speech settings'), run: () => ZhSpeech.openSettings() }],
      };
    return {
      available: false,
      detail: t("Google's {lang} voice isn't downloaded yet. Tap below, find {lang} and download it.", { lang: name }),
      actions: [
        { label: t('Download voice'), run: () => ZhSpeech.installVoice() },
        { label: t('Speech settings'), run: () => ZhSpeech.openSettings() },
      ],
    };
  }
  if (!('speechSynthesis' in window)) return { available: false, detail: t("This browser doesn't support speech."), actions: [] };
  const voice = pickVoice(await loadVoices(), lang);
  if (voice) return { available: true, detail: t('Using {voice}.', { voice: voice.name }), actions: [] };
  return {
    available: false,
    detail:
      lang === 'zh'
        ? t(
            'This browser has no Chinese voice, so audio would be silent. Chrome and Edge include free online Chinese voices. On Windows you can also add one in Settings → Time & language → Language & region → Add a language → Chinese (Simplified, China), with "Text-to-speech" ticked, then restart the browser.',
          )
        : t('This browser has no English voice. Chrome and Edge include free online English voices; you can also add one in your device settings.'),
    actions: [],
  };
}

let webTimer: ReturnType<typeof setTimeout> | undefined;

/** Speaks text in the given language (default Chinese). Dialogue labels like "A:" are skipped. */
export async function speak(text: string, rate = 0.85, lang: LearnLang = 'zh'): Promise<void> {
  const clean = text.replace(/\b[AB]\s*[:：]\s*/g, '');
  if (native) {
    try {
      await ZhSpeech.speak({ text: clean, rate, lang });
    } catch (e) {
      if (/NO_(CHINESE|ENGLISH)_VOICE|NO_VOICE/.test(String((e as Error).message))) throw new NoVoiceError(lang);
      throw e;
    }
    return;
  }
  if (!('speechSynthesis' in window)) throw new Error(t('Speech is not supported in this browser'));
  const voice = pickVoice(await loadVoices(), lang);
  if (!voice) throw new NoVoiceError(lang);
  const synth = window.speechSynthesis;
  const wasBusy = synth.speaking || synth.pending;
  synth.cancel();
  clearTimeout(webTimer);
  await new Promise<void>((resolve, reject) => {
    const start = () => {
      const u = new SpeechSynthesisUtterance(clean);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = rate;
      u.volume = 1;
      u.onend = () => resolve();
      u.onerror = (e) =>
        e.error === 'interrupted' || e.error === 'canceled'
          ? resolve()
          : reject(new Error(e.error === 'not-allowed' ? t('Tap Play to hear the sentence.') : e.error));
      synth.speak(u);
    };
    // Chrome sometimes drops an utterance queued right after cancel().
    if (wasBusy) webTimer = setTimeout(start, 80);
    else start();
  });
}

/** Shows a banner (App listens) when audio can't play; other errors are logged. */
export function reportSpeechError(e: unknown) {
  if (e instanceof NoVoiceError) window.dispatchEvent(new CustomEvent('dj:no-voice', { detail: e.lang }));
  else console.warn('Speech failed', e);
}
