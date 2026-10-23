import { useEffect, useMemo, useRef, useState } from 'react';
import { choiceQuestions, shortGloss } from '../lib/vocabGame';
import { useT } from '../i18n';
import type { LearnLang } from '../lib/learn';
import type { VocabItem } from '../lib/vocab';

export const SPEED_MS = 30000;

export interface SpeedResult {
  score: number;
  right: number;
  wrong: number;
}

interface Props {
  pool: VocabItem[];
  seed: number;
  /** 'meaning': see the word, tap its meaning. 'word': see the meaning, tap the word. */
  direction: 'meaning' | 'word';
  lang: LearnLang;
  showPy: boolean;
  /** When the clock starts (ms since epoch); vs matches start both players together. */
  startAt: number;
  onAnswer?: (ok: boolean, ms: number, score: number, answered: number) => void;
  onDone: (r: SpeedResult) => void;
}

/** 30 seconds of four-option vocabulary questions. Right +1, wrong −1. */
export default function SpeedRound({ pool, seed, direction, lang, showPy, startAt, onAnswer, onDone }: Props) {
  const t = useT();
  const questions = useMemo(() => choiceQuestions(pool, seed), [pool, seed]);
  const [i, setI] = useState(0);
  const [result, setResult] = useState<SpeedResult>({ score: 0, right: 0, wrong: 0 });
  const [flash, setFlash] = useState<{ picked: string; ok: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  const shownAt = useRef(startAt);
  const done = useRef(false);
  const q = questions(i);
  const left = Math.max(0, startAt + SPEED_MS - now);
  const started = now >= startAt;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (started && left <= 0 && !done.current) {
      done.current = true;
      onDone(result);
    }
  }, [started, left, result, onDone]);

  const pick = (v: VocabItem) => {
    if (!started || left <= 0 || flash) return;
    const ok = v.id === q.item.id;
    const next = { score: result.score + (ok ? 1 : -1), right: result.right + (ok ? 1 : 0), wrong: result.wrong + (ok ? 0 : 1) };
    setResult(next);
    onAnswer?.(ok, Date.now() - shownAt.current, next.score, next.right + next.wrong);
    setFlash({ picked: v.id, ok });
    setTimeout(() => {
      setFlash(null);
      setI((n) => n + 1);
      shownAt.current = Date.now();
    }, ok ? 180 : 450);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 4 && q.options[n - 1]) pick(q.options[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!started) {
    return (
      <div className="speed-countdown" role="status" aria-live="assertive">
        {Math.ceil((startAt - now) / 1000)}
      </div>
    );
  }

  const target = lang === 'zh' ? 'zh-CN' : 'en';
  const native = lang === 'zh' ? 'en' : 'zh-CN';
  return (
    <div className="speed">
      <div className="speed-top">
        <div className={`speed-timer${left < 5000 ? ' low' : ''}`} role="timer" aria-label={t('{s} seconds left', { s: Math.ceil(left / 1000) })}>
          <div style={{ width: `${(left / SPEED_MS) * 100}%` }} />
        </div>
        <span className="speed-score" aria-live="polite">{result.score}</span>
      </div>
      <div className={`speed-prompt${flash ? (flash.ok ? ' ok' : ' bad') : ''}`}>
        {direction === 'meaning' ? (
          <span className={`speed-word${lang === 'zh' ? ' zh' : ''}`} lang={target}>
            {showPy && <span className="word-py">{q.item.py}</span>}
            {q.item.text}
          </span>
        ) : (
          <span className="speed-meaning" lang={native}>{shortGloss(q.item.gloss)}</span>
        )}
      </div>
      <div className="speed-options">
        {q.options.map((o, k) => {
          const state = flash && (o.id === q.item.id ? ' ok' : o.id === flash.picked ? ' bad' : '');
          return (
            <button key={o.id + k} className={`speed-option${state || ''}${direction === 'word' && lang === 'zh' ? ' zh' : ''}`} onClick={() => pick(o)} lang={direction === 'meaning' ? native : target}>
              {direction === 'meaning' ? shortGloss(o.gloss) : o.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
