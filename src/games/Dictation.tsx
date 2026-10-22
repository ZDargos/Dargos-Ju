import { useEffect, useMemo, useState } from 'react';
import type { GameProps } from './registry';
import { normalize, tilesOf } from './common';
import { isHanWord } from '../lib/segmenter';
import { shuffle } from '../lib/srs';
import { speak, ttsAvailable } from '../lib/tts';
import { IconSpeaker } from '../components/Icons';
import TileBuilder from './TileBuilder';
import Feedback from './Feedback';
import { useShowPinyin } from '../components/Pinyin';

type Mode = 'tiles' | 'type';

export default function Dictation({ sentence, pool, content, settings, hints, onResult, onNext }: GameProps) {
  const [mode, setMode] = useState<Mode>('tiles');
  const [result, setResult] = useState<boolean | null>(null);
  const [typed, setTyped] = useState('');
  const [showEn, setShowEn] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const pinyin = useShowPinyin();
  const target = useMemo(() => tilesOf(sentence), [sentence]);
  const extras = useMemo(() => {
    const own = new Set(target);
    return shuffle([...new Set(pool.flatMap((s) => s.tokens.filter(isHanWord)))].filter((w) => !own.has(w))).slice(0, 3);
  }, [pool, target]);

  const play = (rate = settings.speechRate) => {
    setSpeechError('');
    speak(sentence.zh, rate).catch((e) => setSpeechError((e as Error).message));
  };
  useEffect(() => {
    const t = setTimeout(() => play(), 300);
    return () => clearTimeout(t);
    // Play once per new sentence.
  }, [sentence.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (ok: boolean, answer: string) => {
    setResult(ok);
    onResult(ok, answer);
  };

  if (!ttsAvailable()) return <div className="card empty">This device has no text-to-speech voice, so Dictation can't play sentences.</div>;

  return (
    <>
      <div className="row" style={{ justifyContent: 'center', gap: 12, margin: '6px 0 16px' }}>
        <button className="btn accent" style={{ minWidth: 140 }} onClick={() => play()}>
          <IconSpeaker /> Play
        </button>
        <button className="btn" onClick={() => play(Math.max(0.5, settings.speechRate - 0.3))}>
          Slow
        </button>
      </div>
      {speechError && <div className="error center">{speechError}</div>}
      {hints && (
        <div className="hint center">
          {showEn ? (
            sentence.en
          ) : (
            <button className="btn ghost sm" style={{ padding: 0, minHeight: 0 }} onClick={() => setShowEn(true)}>
              Show the English meaning
            </button>
          )}
        </div>
      )}
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={mode === 'tiles' ? 'on' : ''} disabled={result !== null} onClick={() => setMode('tiles')}>
          Tiles
        </button>
        <button className={mode === 'type' ? 'on' : ''} disabled={result !== null} onClick={() => setMode('type')}>
          Type it
        </button>
      </div>
      {mode === 'tiles' ? (
        <TileBuilder target={target} distractors={extras} lexicon={content.lexicon} showPinyin={pinyin} onChecked={finish} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (result === null && typed.trim()) finish(normalize(typed) === normalize(sentence.zh), typed.trim());
          }}
        >
          <input
            className="input zh"
            style={{ fontSize: 20 }}
            lang="zh-CN"
            placeholder="Type what you hear"
            value={typed}
            disabled={result !== null}
            onChange={(e) => setTyped(e.target.value)}
          />
          {result === null && (
            <button className="btn primary block" style={{ marginTop: 12 }} disabled={!typed.trim()}>
              Check
            </button>
          )}
        </form>
      )}
      {result !== null && <Feedback correct={result} sentence={sentence} rate={settings.speechRate} onNext={onNext} />}
    </>
  );
}
