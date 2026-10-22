import type { LearnSentence } from '../lib/learn';

/** The sentence in the player's own language, shown as the thing to translate. */
export default function NativePrompt({ sentence }: { sentence: LearnSentence }) {
  const zh = sentence.lang === 'en';
  return (
    <div className={`card center${zh ? ' zh' : ''}`} style={{ marginBottom: 16, fontSize: zh ? 22 : 19, fontWeight: 500 }} lang={zh ? 'zh-CN' : 'en'}>
      {sentence.native}
    </div>
  );
}
