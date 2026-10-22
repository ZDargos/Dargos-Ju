import { useMemo, useState } from 'react';
import type { GameProps } from './registry';
import { pick, tilesOf } from './common';
import { isHanWord } from '../lib/segmenter';
import { shuffle } from '../lib/srs';
import { reportSpeechError, speak, ttsAvailable } from '../lib/tts';
import { IconSpeaker } from '../components/Icons';
import TileBuilder from './TileBuilder';
import Feedback from './Feedback';
import { useShowPinyin } from '../components/Pinyin';
import type { Sentence } from '../types';

type Mode = 'translate' | 'free';

function distractorsFor(sentence: Sentence, pool: Sentence[], n: number): string[] {
  const own = new Set(tilesOf(sentence));
  const words = [...new Set(pool.flatMap((s) => s.tokens.filter(isHanWord)))].filter((w) => !own.has(w));
  // Prefer words of similar length so the extras are plausible.
  const lengths = new Set([...own].map((w) => w.length));
  const similar = words.filter((w) => lengths.has(w.length));
  return shuffle(similar.length >= n ? similar : words).slice(0, n);
}

export default function SentenceBuilder(props: GameProps) {
  const [mode, setMode] = useState<Mode>('translate');
  if (props.vs) return <Translate key={props.sentence.id} {...props} />;
  return (
    <>
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={mode === 'translate' ? 'on' : ''} onClick={() => setMode('translate')}>Translate</button>
        <button className={mode === 'free' ? 'on' : ''} onClick={() => setMode('free')}>Free build</button>
      </div>
      {mode === 'translate' ? <Translate key={props.sentence.id} {...props} /> : <Free key={props.sentence.id} {...props} />}
    </>
  );
}

function Translate({ sentence, pool, content, settings, hints, onResult, onNext }: GameProps) {
  const target = useMemo(() => tilesOf(sentence), [sentence]);
  const extras = useMemo(() => distractorsFor(sentence, pool, Math.min(5, Math.max(3, Math.round(target.length / 2)))), [sentence, pool, target]);
  const [result, setResult] = useState<boolean | null>(null);
  const pinyin = useShowPinyin();
  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>Translate using the word bank. Some words don't belong.</p>
      <div className="card center" style={{ marginBottom: 16, fontSize: 19, fontWeight: 500 }}>{sentence.en}</div>
      <TileBuilder
        target={target}
        distractors={extras}
        lexicon={content.lexicon}
        showPinyin={pinyin}
        allowHint={hints}
        onChecked={(ok, built) => {
          setResult(ok);
          onResult(ok, built);
        }}
      />
      {result !== null && <Feedback correct={result} sentence={sentence} rate={settings.speechRate} onNext={onNext} />}
    </>
  );
}

function Free({ sentence, pool, content, settings, onResult, onNext }: GameProps) {
  // A word bank drawn from this sentence and two others; build anything that makes sense.
  const sources = useMemo(() => [sentence, ...shuffle(pool.filter((s) => s.id !== sentence.id)).slice(0, 2)], [sentence, pool]);
  const bank = useMemo(() => {
    const words = [...new Set(sources.flatMap((s) => s.tokens.filter(isHanWord)))];
    return shuffle(words).slice(0, 12);
  }, [sources]);
  const [built, setBuilt] = useState<string | null>(null);
  const pinyin = useShowPinyin();
  const [graded, setGraded] = useState(false);
  const examples = sources.filter((s) => s.tokens.some((t) => bank.includes(t)));
  const prompt = useMemo(() => pick(['Make a question.', 'Make a statement.', 'Make a negative sentence.', 'Use as many words as you can.', 'Talk about yourself.']), []);

  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>
        Build your own sentence from these words, then check it yourself. <strong>{prompt}</strong>
      </p>
      <TileBuilder target={bank} lexicon={content.lexicon} showPinyin={pinyin} judge={false} checkLabel="Done" onChecked={() => undefined} onBuilt={setBuilt} />
      {built !== null && (
        <>
          <div className="card" style={{ marginTop: 14 }}>
            <div className="small muted">Your sentence</div>
            <div className="zh" style={{ fontSize: 22 }}>{built}</div>
            {ttsAvailable() && (
              <button className="btn ghost sm" style={{ paddingLeft: 0 }} onClick={() => speak(built, settings.speechRate).catch(reportSpeechError)}>
                <IconSpeaker /> Hear it
              </button>
            )}
            <div className="small muted" style={{ marginTop: 10 }}>Sentences that use these words:</div>
            {examples.map((s) => (
              <div key={s.id} style={{ marginTop: 6 }}>
                <div className="zh">{s.zh}</div>
                <div className="small muted">{s.en}</div>
              </div>
            ))}
          </div>
          {!graded ? (
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn grow" onClick={() => { setGraded(true); onResult(false); }}>Not sure it's right</button>
              <button className="btn primary grow" onClick={() => { setGraded(true); onResult(true); }}>Makes sense</button>
            </div>
          ) : (
            <button className="btn primary block" style={{ marginTop: 12 }} onClick={onNext}>Next</button>
          )}
        </>
      )}
    </>
  );
}
