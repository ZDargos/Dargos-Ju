import { Fragment, useMemo, useState } from 'react';
import type { GameProps } from './registry';
import { mutate } from './common';
import { isHanWord, isPunctuation } from '../lib/segmenter';
import Feedback from './Feedback';

type Choice = { type: 'word' | 'gap'; index: number };

export default function SpotError({ sentence, pool, settings, hints, onResult, onNext }: GameProps) {
  const vocab = useMemo(() => [...new Set(pool.flatMap((s) => s.tokens.filter(isHanWord)))], [pool]);
  const m = useMemo(() => mutate(sentence.tokens, vocab, ['replace', 'extra', 'missing']), [sentence, vocab]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [showEn, setShowEn] = useState(false);

  if (!m) {
    return (
      <div className="card empty">
        This sentence is too short for this game. <button className="btn sm" onClick={onNext}>Skip</button>
      </div>
    );
  }

  const answer: Choice = m.kind === 'missing' ? { type: 'gap', index: m.index } : { type: 'word', index: m.index };
  const same = (a: Choice, b: Choice) => a.type === b.type && a.index === b.index;
  const correct = choice ? same(choice, answer) : false;
  const choose = (c: Choice) => {
    if (choice) return;
    setChoice(c);
    onResult(same(c, answer));
  };
  const cls = (c: Choice) => {
    if (!choice) return '';
    if (same(c, answer)) return ' ok';
    if (same(c, choice)) return ' bad';
    return '';
  };
  const explain =
    m.kind === 'replace'
      ? `"${m.tokens[m.index]}" should be "${m.original}".`
      : m.kind === 'extra'
        ? `"${m.tokens[m.index]}" doesn't belong.`
        : `"${m.original}" was missing.`;

  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>Tap the wrong or extra word, or tap the gap where a word is missing.</p>
      {hints && (
        <div className="hint">
          {showEn ? (
            sentence.en
          ) : (
            <button className="btn ghost sm" style={{ padding: 0, minHeight: 0 }} onClick={() => setShowEn(true)}>
              Show the English meaning
            </button>
          )}
        </div>
      )}
      <div className="card" style={{ padding: '22px 10px' }}>
        <div className="spot">
          {m.tokens.map((t, i) => {
            const gap: Choice = { type: 'gap', index: i };
            const word: Choice = { type: 'word', index: i };
            return (
              <Fragment key={i}>
                {!isPunctuation(t) && <button className={`spot-gap${cls(gap)}`} aria-label={`Gap before ${t}`} onClick={() => choose(gap)} />}
                {isPunctuation(t) ? (
                  <span className="spot-punct">{t}</span>
                ) : (
                  <button className={`spot-word${cls(word)}`} onClick={() => choose(word)}>
                    {t}
                  </button>
                )}
              </Fragment>
            );
          })}
          <button
            className={`spot-gap${cls({ type: 'gap', index: m.tokens.length })}`}
            aria-label="Gap at the end"
            onClick={() => choose({ type: 'gap', index: m.tokens.length })}
          />
        </div>
      </div>
      {choice && (
        <Feedback correct={correct} sentence={sentence} rate={settings.speechRate} onNext={onNext}>
          <div className="small" style={{ marginTop: 4 }}>{explain}</div>
        </Feedback>
      )}
    </>
  );
}
