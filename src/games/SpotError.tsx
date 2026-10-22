import { Fragment, useState } from 'react';
import type { GameProps } from './registry';
import { mutate, vocabOf } from './common';
import { lexiconFor, lookup, opsFor } from '../lib/learn';
import { langParams, useT } from '../i18n';
import Feedback from './Feedback';
import { useShowPinyin } from '../components/Pinyin';

type Choice = { type: 'word' | 'gap'; index: number };

export default function SpotError({ sentence, pool, content, settings, hints, onResult, onNext }: GameProps) {
  const t = useT();
  const ops = opsFor(sentence.lang);
  // Made once per round so re-renders (like the pinyin switch) never change the puzzle.
  const [m] = useState(() => mutate(sentence.tokens, vocabOf(pool.map((s) => s.tokens), ops), ops, ['replace', 'extra', 'missing']));
  const [choice, setChoice] = useState<Choice | null>(null);
  const [showMeaning, setShowMeaning] = useState(false);
  const pinyin = useShowPinyin();
  const lexicon = lexiconFor(content, sentence.lang);

  if (!m) {
    return (
      <div className="card empty">
        {t('This sentence is too short for this game.')} <button className="btn sm" onClick={onNext}>{t('Skip')}</button>
      </div>
    );
  }

  const answer: Choice = m.kind === 'missing' ? { type: 'gap', index: m.index } : { type: 'word', index: m.index };
  const same = (a: Choice, b: Choice) => a.type === b.type && a.index === b.index;
  const correct = choice ? same(choice, answer) : false;
  const choose = (c: Choice) => {
    if (choice) return;
    setChoice(c);
    const where =
      c.type === 'word'
        ? t('tapped "{word}"', { word: m.tokens[c.index] })
        : c.index >= m.tokens.length
          ? t('tapped the end')
          : t('tapped the gap before "{word}"', { word: m.tokens[c.index] });
    onResult(same(c, answer), `${ops.join(m.tokens)} (${where})`);
  };
  const cls = (c: Choice) => {
    if (!choice) return '';
    if (same(c, answer)) return ' ok';
    if (same(c, choice)) return ' bad';
    return '';
  };
  const explain =
    m.kind === 'replace'
      ? t('"{wrong}" should be "{right}".', { wrong: m.tokens[m.index], right: m.original ?? '' })
      : m.kind === 'extra'
        ? t('"{word}" doesn\'t belong.', { word: m.tokens[m.index] })
        : t('"{word}" was missing.', { word: m.original ?? '' });

  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>{t('Tap the wrong or extra word, or tap the gap where a word is missing.')}</p>
      {hints && (
        <div className="hint">
          {showMeaning ? (
            <span lang={sentence.lang === 'zh' ? 'en' : 'zh-CN'}>{sentence.native}</span>
          ) : (
            <button className="btn ghost sm" style={{ padding: 0, minHeight: 0 }} onClick={() => setShowMeaning(true)}>
              {t('Show the {native} meaning', langParams(sentence.lang))}
            </button>
          )}
        </div>
      )}
      <div className="card" style={{ padding: '22px 10px' }}>
        <div className={`spot${sentence.lang === 'en' ? ' en' : ''}`} lang={ops.speech}>
          {m.tokens.map((tok, i) => {
            const gap: Choice = { type: 'gap', index: i };
            const word: Choice = { type: 'word', index: i };
            return (
              <Fragment key={i}>
                {ops.isTile(tok) && <button className={`spot-gap${cls(gap)}`} aria-label={t('Gap before {word}', { word: tok })} onClick={() => choose(gap)} />}
                {!ops.isTile(tok) ? (
                  <span className="spot-punct">{tok}</span>
                ) : (
                  <button className={`spot-word${cls(word)}`} onClick={() => choose(word)}>
                    {pinyin ? (
                      <span className="pinyin-word">
                        <span className="py" style={{ fontSize: 11 }}>{lookup(lexicon, tok)?.py || ' '}</span>
                        <span>{tok}</span>
                      </span>
                    ) : (
                      tok
                    )}
                  </button>
                )}
              </Fragment>
            );
          })}
          <button
            className={`spot-gap${cls({ type: 'gap', index: m.tokens.length })}`}
            aria-label={t('Gap at the end')}
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
