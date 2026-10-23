import { useEffect, useMemo, useRef, useState } from 'react';
import { answerText, choiceQuestions, type SpeedAnswer } from '../lib/vocabGame';
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
  /** Whether the answers (or prompts) are meanings or pinyin/phonetics. */
  answer: SpeedAnswer;
  lang: LearnLang;
  showPy: boolean;
  /** When the clock starts (ms since epoch); vs matches start both players together. */
  startAt: number;
  onAnswer?: (ok: boolean, ms: number, score: number, answered: number, item: VocabItem) => void;
  onDone: (r: SpeedResult) => void;
}

/** 30 seconds of four-option vocabulary questions. Right +1, wrong −1. */
export default function SpeedRound({ pool, seed, direction, answer, lang, showPy, startAt, onAnswer, onDone }: Props) {
  const t = useT();
  const questions = useMemo(() => choiceQuestions(pool, seed, answer), [pool, seed, answer]);
  // Pinyin above the word would give the answer away when the answers are pinyin.
  const hint = showPy && answer === 'meaning';
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
    onAnswer?.(ok, Date.now() - shownAt.current, next.score, next.right + next.wrong, q.item);
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
            {hint && <span className="word-py">{q.item.py}</span>}
            {q.item.text}
          </span>
        ) : (
          <span className={`speed-meaning${answer === 'sound' ? ' sound' : ''}`} lang={answer === 'sound' ? undefined : native}>{answerText(q.item, answer)}</span>
        )}
      </div>
      <div className="speed-options">
        {q.options.map((o, k) => {
          const state = flash && (o.id === q.item.id ? ' ok' : o.id === flash.picked ? ' bad' : '');
          return (
            <button key={o.id + k} className={`speed-option${state || ''}${direction === 'word' && lang === 'zh' ? ' zh' : ''}${direction === 'meaning' && answer === 'sound' ? ' sound' : ''}`} onClick={() => pick(o)} lang={direction === 'meaning' ? (answer === 'sound' ? undefined : native) : target}>
              {direction === 'meaning' ? answerText(o, answer) : o.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Label for an answer type: "Definitions", or "Pinyin" / "Phonetics" for the sound. */
export const answerLabel = (answer: SpeedAnswer, lang: LearnLang, t: (k: string) => string) =>
  answer === 'meaning' ? t('Definitions') : lang === 'zh' ? t('Pinyin') : t('Phonetics');

/** Picks what Speed round answers are, before starting. */
export function SpeedAnswerPicker({ value, onChange, lang }: { value: SpeedAnswer; onChange: (a: SpeedAnswer) => void; lang: LearnLang }) {
  const t = useT();
  return (
    <div className="segmented" role="group" aria-label={t('Game mode')} style={{ margin: '0 0 14px' }}>
      {(['meaning', 'sound'] as SpeedAnswer[]).map((a) => (
        <button key={a} className={value === a ? 'on' : ''} aria-pressed={value === a} onClick={() => onChange(a)}>
          {answerLabel(a, lang, t)}
        </button>
      ))}
    </div>
  );
}

const answerKey = (game: string, lang: LearnLang) => `dj:speed-answer:${game}:${lang}`;

/** The answer type last used for a game, remembered on this device. */
export function useSpeedAnswer(game: string, lang: LearnLang): [SpeedAnswer, (a: SpeedAnswer) => void] {
  const [answer, setAnswer] = useState<SpeedAnswer>(() => {
    try {
      return localStorage.getItem(answerKey(game, lang)) === 'sound' ? 'sound' : 'meaning';
    } catch {
      return 'meaning';
    }
  });
  const set = (a: SpeedAnswer) => {
    setAnswer(a);
    try {
      localStorage.setItem(answerKey(game, lang), a);
    } catch {
      /* this visit only */
    }
  };
  return [answer, set];
}
