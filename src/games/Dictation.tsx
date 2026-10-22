import { useEffect, useMemo, useState } from 'react';
import type { GameProps } from './registry';
import { shuffle } from '../lib/srs';
import { lexiconFor, opsFor, tilesFor } from '../lib/learn';
import { speak, ttsAvailable } from '../lib/tts';
import { langParams, useT } from '../i18n';
import { IconSpeaker } from '../components/Icons';
import TileBuilder from './TileBuilder';
import Feedback from './Feedback';
import { useShowPinyin } from '../components/Pinyin';

type Mode = 'tiles' | 'type';

export default function Dictation({ sentence, pool, content, settings, hints, onResult, onNext }: GameProps) {
  const t = useT();
  const ops = opsFor(sentence.lang);
  const [mode, setMode] = useState<Mode>('tiles');
  const [result, setResult] = useState<boolean | null>(null);
  const [typed, setTyped] = useState('');
  const [showMeaning, setShowMeaning] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const pinyin = useShowPinyin();
  const target = useMemo(() => tilesFor(sentence, content), [sentence, content]);
  const [extras] = useState(() => {
    const own = new Set(tilesFor(sentence, content));
    return shuffle([...new Set(pool.flatMap((s) => tilesFor(s, content).filter(ops.isWord)))].filter((w) => !own.has(w))).slice(0, 3);
  });

  const play = (rate = settings.speechRate) => {
    setSpeechError('');
    speak(sentence.target, rate, sentence.lang).catch((e) => setSpeechError((e as Error).message));
  };
  useEffect(() => {
    const timer = setTimeout(() => play(), 300);
    return () => clearTimeout(timer);
    // Play once per new sentence.
  }, [sentence.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (ok: boolean, answer: string) => {
    setResult(ok);
    onResult(ok, answer);
  };

  if (!ttsAvailable()) return <div className="card empty">{t("This device has no text-to-speech voice, so Dictation can't play sentences.")}</div>;

  return (
    <>
      <div className="row" style={{ justifyContent: 'center', gap: 12, margin: '6px 0 16px' }}>
        <button className="btn accent" style={{ minWidth: 140 }} onClick={() => play()}>
          <IconSpeaker /> {t('Play')}
        </button>
        <button className="btn" onClick={() => play(Math.max(0.5, settings.speechRate - 0.3))}>
          {t('Slow')}
        </button>
      </div>
      {speechError && <div className="error center">{speechError}</div>}
      {hints && (
        <div className="hint center">
          {showMeaning ? (
            <span lang={sentence.lang === 'zh' ? 'en' : 'zh-CN'}>{sentence.native}</span>
          ) : (
            <button className="btn ghost sm" style={{ padding: 0, minHeight: 0 }} onClick={() => setShowMeaning(true)}>
              {t('Show the {native} meaning', langParams(sentence.lang))}
            </button>
          )}
        </div>
      )}
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={mode === 'tiles' ? 'on' : ''} disabled={result !== null} onClick={() => setMode('tiles')}>
          {t('Tiles')}
        </button>
        <button className={mode === 'type' ? 'on' : ''} disabled={result !== null} onClick={() => setMode('type')}>
          {t('Type it')}
        </button>
      </div>
      {mode === 'tiles' ? (
        <TileBuilder target={target} distractors={extras} lexicon={lexiconFor(content, sentence.lang)} ops={ops} showPinyin={pinyin} onChecked={finish} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (result === null && typed.trim()) finish(ops.normalize(typed) === ops.normalize(sentence.target), typed.trim());
          }}
        >
          <input
            className={`input${sentence.lang === 'zh' ? ' zh' : ''}`}
            style={{ fontSize: 20 }}
            lang={ops.speech}
            autoCapitalize={sentence.lang === 'en' ? 'sentences' : 'off'}
            autoCorrect="off"
            spellCheck={false}
            placeholder={t('Type what you hear')}
            aria-label={t('Type what you hear')}
            value={typed}
            disabled={result !== null}
            onChange={(e) => setTyped(e.target.value)}
          />
          {result === null && (
            <button className="btn primary block" style={{ marginTop: 12 }} disabled={!typed.trim()}>
              {t('Check')}
            </button>
          )}
        </form>
      )}
      {result !== null && <Feedback correct={result} sentence={sentence} rate={settings.speechRate} onNext={onNext} />}
    </>
  );
}
