// Chinese text-to-speech.
// - Android app: a small native plugin (ZhSpeechPlugin.java) that prefers Google's speech engine,
//   since many phones default to an engine with no Chinese voice.
// - Web: the browser's speechSynthesis, using a Chinese voice only. Without one, browsers read
//   Chinese with an English voice, which skips the characters and plays silence, so we refuse
//   and explain how to get a voice instead.

import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeStatus {
  ready: boolean;
  engine: string | null;
  googleInstalled: boolean;
  chinese: boolean;
  missingData: boolean;
}

interface ZhSpeechPlugin {
  status(): Promise<NativeStatus>;
  speak(options: { text: string; rate: number }): Promise<void>;
  stop(): Promise<void>;
  installVoice(): Promise<void>;
  openSettings(): Promise<void>;
}

const ZhSpeech = registerPlugin<ZhSpeechPlugin>('ZhSpeech');
const native = Capacitor.isNativePlatform();

export class NoChineseVoiceError extends Error {
  constructor() {
    super('No Chinese voice is installed on this device. See Settings → Audio to fix it.');
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

function pickChineseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const zh = voices.filter((v) => /^(zh|cmn)([-_](CN|Hans|Hans[-_]CN))?$/i.test(v.lang));
  const mainland = zh.filter((v) => /CN|Hans/i.test(v.lang) || v.lang.toLowerCase() === 'zh');
  const pool = mainland.length ? mainland : zh;
  return pool.find((v) => /natural|online|google/i.test(v.name)) ?? pool[0];
}

export function ttsAvailable(): boolean {
  return native || (typeof window !== 'undefined' && 'speechSynthesis' in window);
}

export async function voiceStatus(): Promise<VoiceStatus> {
  if (native) {
    const s = await ZhSpeech.status();
    if (s.chinese) return { available: true, detail: `Chinese voice ready (${s.engine === 'com.google.android.tts' ? 'Google' : s.engine ?? 'system'} speech engine).`, actions: [] };
    if (!s.googleInstalled)
      return {
        available: false,
        detail: 'Your phone has no Chinese voice. Install "Speech Services by Google" from the Play Store, then download its Chinese (Mandarin) voice.',
        actions: [{ label: 'Open speech settings', run: () => ZhSpeech.openSettings() }],
      };
    return {
      available: false,
      detail: "Google's Chinese (Mandarin) voice isn't downloaded yet. Tap below, find Chinese (Mandarin, China) and download it.",
      actions: [
        { label: 'Download Chinese voice', run: () => ZhSpeech.installVoice() },
        { label: 'Speech settings', run: () => ZhSpeech.openSettings() },
      ],
    };
  }
  if (!('speechSynthesis' in window)) return { available: false, detail: "This browser doesn't support speech.", actions: [] };
  const voice = pickChineseVoice(await loadVoices());
  if (voice) return { available: true, detail: `Using ${voice.name}.`, actions: [] };
  return {
    available: false,
    detail:
      'This browser has no Chinese voice, so audio would be silent. Chrome and Edge include free online Chinese voices. ' +
      'On Windows you can also add one in Settings → Time & language → Language & region → Add a language → Chinese (Simplified, China), with "Text-to-speech" ticked, then restart the browser.',
    actions: [],
  };
}

let webTimer: ReturnType<typeof setTimeout> | undefined;

export async function speak(text: string, rate = 0.85): Promise<void> {
  const clean = text.replace(/\b[AB]\s*[:：]\s*/g, '');
  if (native) {
    try {
      await ZhSpeech.speak({ text: clean, rate });
    } catch (e) {
      if (/NO_CHINESE_VOICE/.test(String((e as Error).message))) throw new NoChineseVoiceError();
      throw e;
    }
    return;
  }
  if (!('speechSynthesis' in window)) throw new Error('Speech is not supported in this browser');
  const voice = pickChineseVoice(await loadVoices());
  if (!voice) throw new NoChineseVoiceError();
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
      u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? resolve() : reject(new Error(e.error)));
      synth.speak(u);
    };
    // Chrome sometimes drops an utterance queued right after cancel().
    if (wasBusy) webTimer = setTimeout(start, 80);
    else start();
  });
}

/** Shows a banner (App listens) when audio can't play; other errors are logged. */
export function reportSpeechError(e: unknown) {
  if (e instanceof NoChineseVoiceError) window.dispatchEvent(new CustomEvent('dj:no-voice'));
  else console.warn('Speech failed', e);
}
