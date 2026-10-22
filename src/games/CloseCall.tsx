import { useState } from 'react';
import type { GameProps } from './registry';
import { mutate, vocabOf } from './common';
import { shuffle } from '../lib/srs';
import { lexiconFor, opsFor } from '../lib/learn';
import { useT } from '../i18n';
import Feedback from './Feedback';
import NativePrompt from './NativePrompt';
import { PinyinText, useShowPinyin } from '../components/Pinyin';

export default function CloseCall({ sentence, pool, content, settings, hints, onResult, onNext }: GameProps) {
  const t = useT();
  const pinyin = useShowPinyin();
  const ops = opsFor(sentence.lang);
  // Generated once per round (the screen remounts this for each sentence). Using state rather
  // than useMemo keeps the options from reshuffling when anything else re-renders the screen.
  const [options] = useState(() => {
    const vocab = vocabOf(pool.map((s) => s.tokens), ops);
    const seen = new Set([ops.normalize(sentence.target)]);
    const wrong: { text: string; tokens: string[] }[] = [];
    for (let tries = 0; tries < 30 && wrong.length < 3; tries++) {
      const m = mutate(sentence.tokens, vocab, ops, ['replace', 'replace', 'swap', 'extra', 'missing']);
      if (!m) continue;
      const text = ops.join(m.tokens);
      if (seen.has(ops.normalize(text))) continue;
      seen.add(ops.normalize(text));
      wrong.push({ text, tokens: m.tokens });
    }
    return shuffle([{ text: sentence.target, tokens: sentence.tokens, correct: true }, ...wrong.map((w) => ({ ...w, correct: false }))]);
  });
  const [picked, setPicked] = useState<number | null>(null);
  const [removed, setRemoved] = useState<Set<number>>(new Set());

  const removeOne = () => {
    const candidates = options.map((o, i) => (!o.correct && !removed.has(i) ? i : -1)).filter((i) => i >= 0);
    if (candidates.length > 1) setRemoved(new Set(removed).add(candidates[Math.floor(Math.random() * candidates.length)]));
  };

  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>{t('Which one says this?')}</p>
      <NativePrompt sentence={sentence} />
      {options.map((o, i) =>
        removed.has(i) ? null : (
          <button
            key={i}
            className={`option${sentence.lang === 'en' ? ' en' : ''}${picked !== null ? (o.correct ? ' ok' : picked === i ? ' bad' : '') : ''}`}
            onClick={() => {
              if (picked !== null) return;
              setPicked(i);
              onResult(o.correct, o.text);
            }}
          >
            <PinyinText tokens={o.tokens} text={o.text} lexicon={lexiconFor(content, sentence.lang)} show={pinyin} lang={sentence.lang} style={{ justifyContent: 'flex-start' }} />
          </button>
        ),
      )}
      {hints && picked === null && options.length > 2 && (
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={removeOne} disabled={options.length - removed.size <= 2}>
          {t('Remove one wrong option')}
        </button>
      )}
      {picked !== null && <Feedback correct={options[picked].correct} sentence={sentence} rate={settings.speechRate} onNext={onNext} />}
    </>
  );
}
