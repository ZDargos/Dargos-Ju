import { useState } from 'react';
import type { GameProps } from './registry';
import { joinTokens, mutate, normalize } from './common';
import { isHanWord } from '../lib/segmenter';
import { shuffle } from '../lib/srs';
import Feedback from './Feedback';
import { PinyinText, useShowPinyin } from '../components/Pinyin';

export default function CloseCall({ sentence, pool, content, settings, hints, onResult, onNext }: GameProps) {
  const pinyin = useShowPinyin();
  // Generated once per round (the screen remounts this for each sentence). Using state rather
  // than useMemo keeps the options from reshuffling when anything else re-renders the screen.
  const [options] = useState(() => {
    const vocab = [...new Set(pool.flatMap((s) => s.tokens.filter(isHanWord)))];
    const seen = new Set([normalize(sentence.zh)]);
    const wrong: { text: string; tokens: string[] }[] = [];
    for (let tries = 0; tries < 30 && wrong.length < 3; tries++) {
      const m = mutate(sentence.tokens, vocab, ['replace', 'replace', 'swap', 'extra', 'missing']);
      if (!m) continue;
      const text = joinTokens(m.tokens);
      if (seen.has(normalize(text))) continue;
      seen.add(normalize(text));
      wrong.push({ text, tokens: m.tokens });
    }
    return shuffle([{ text: sentence.zh, tokens: sentence.tokens, correct: true }, ...wrong.map((w) => ({ ...w, correct: false }))]);
  });
  const [picked, setPicked] = useState<number | null>(null);
  const [removed, setRemoved] = useState<Set<number>>(new Set());

  const removeOne = () => {
    const candidates = options.map((o, i) => (!o.correct && !removed.has(i) ? i : -1)).filter((i) => i >= 0);
    if (candidates.length > 1) setRemoved(new Set(removed).add(candidates[Math.floor(Math.random() * candidates.length)]));
  };

  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>Which one says this?</p>
      <div className="card center" style={{ marginBottom: 14, fontSize: 19, fontWeight: 500 }}>{sentence.en}</div>
      {options.map((o, i) =>
        removed.has(i) ? null : (
          <button
            key={i}
            className={`option${picked !== null ? (o.correct ? ' ok' : picked === i ? ' bad' : '') : ''}`}
            onClick={() => {
              if (picked !== null) return;
              setPicked(i);
              onResult(o.correct, o.text);
            }}
          >
            <PinyinText tokens={o.tokens} text={o.text} lexicon={content.lexicon} show={pinyin} style={{ justifyContent: 'flex-start' }} />
          </button>
        ),
      )}
      {hints && picked === null && options.length > 2 && (
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={removeOne} disabled={options.length - removed.size <= 2}>
          Remove one wrong option
        </button>
      )}
      {picked !== null && <Feedback correct={options[picked].correct} sentence={sentence} rate={settings.speechRate} onNext={onNext} />}
    </>
  );
}
