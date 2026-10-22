// Chinese text-to-speech. Android's WebView has no Web Speech API, so the app uses the native
// Android voice through a Capacitor plugin there, and the browser's speechSynthesis on the web.

import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

const native = Capacitor.isNativePlatform();

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const zh = voices.filter((v) => /^zh[-_](CN|Hans)/i.test(v.lang) || v.lang === 'zh');
  return zh.find((v) => /google|natural|online/i.test(v.name)) ?? zh[0] ?? voices.find((v) => v.lang.startsWith('zh'));
}

export function ttsAvailable(): boolean {
  return native || (typeof window !== 'undefined' && 'speechSynthesis' in window);
}

export async function speak(text: string, rate = 0.85): Promise<void> {
  const clean = text.replace(/\b[AB]\s*[:：]\s*/g, '');
  if (native) {
    await TextToSpeech.stop().catch(() => undefined);
    await TextToSpeech.speak({ text: clean, lang: 'zh-CN', rate, pitch: 1, volume: 1, category: 'playback' });
    return;
  }
  if (!('speechSynthesis' in window)) throw new Error('Speech is not supported in this browser');
  window.speechSynthesis.cancel();
  await new Promise<void>((resolve, reject) => {
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'zh-CN';
    u.rate = rate;
    const v = pickVoice();
    if (v) u.voice = v;
    u.onend = () => resolve();
    u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? resolve() : reject(new Error(e.error)));
    window.speechSynthesis.speak(u);
  });
}

// Some browsers load voices asynchronously.
if (!native && typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', () => window.speechSynthesis.getVoices());
}
