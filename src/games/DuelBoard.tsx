import { useEffect, useRef, useState } from 'react';
import { asDuelLevel, DUEL_LEVELS, DUEL_LIVES, duelIntensity, shortGloss, type DuelLevel } from '../lib/vocabGame';
import { reportSpeechError, speak } from '../lib/tts';
import { useSettings } from '../lib/store';
import { useT } from '../i18n';
import { IconSpeaker } from '../components/Icons';
import type { LearnLang } from '../lib/learn';
import type { VocabItem } from '../lib/vocab';

export interface DuelPlayer {
  name: string;
  lives: number;
}

interface Props {
  item: VocabItem;
  lang: LearnLang;
  /** Whether it's my move (input enabled). */
  myTurn: boolean;
  /** A steal: one chance at a word the other player missed. */
  steal: boolean;
  /** When the move times out (ms since epoch) and how long the move had. */
  deadline: number;
  seconds: number;
  correct: number;
  players: DuelPlayer[];
  /** Whose move it is, for the "answering" line. */
  moverName: string;
  feedback: { ok: boolean; text: string } | null;
  /** Changes with every new move (a new word or a steal), to clear the answer box. */
  moveKey: string | number;
  /** A wrong guess's time penalty, shown briefly to the player who guessed. */
  penalty: { text: string; key: number } | null;
  onSubmit: (typed: string) => void;
  /** The language I type in (vs: mine, even while the opponent's word is showing). */
  inputLang?: LearnLang;
}

/** The duel screen: lives, the word, the shrinking clock and the answer box. Heats up as correct answers pile up. */
export default function DuelBoard({ item, lang, myTurn, steal, deadline, seconds, correct, players, moverName, feedback, moveKey, penalty, onSubmit, inputLang = lang }: Props) {
  const t = useT();
  const settings = useSettings();
  const [typed, setTyped] = useState('');
  const [now, setNow] = useState(Date.now());
  const input = useRef<HTMLInputElement>(null);
  const heat = duelIntensity(correct);
  const left = Math.max(0, deadline - now);
  const low = left < 3000;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);

  // New word: clear the box and, in English mode, say the word to spell on my move. The answer box
  // stays on screen (and focused) for the whole game, so the phone keyboard never closes between
  // words; iPhones only open the keyboard again after a tap.
  useEffect(() => {
    setTyped('');
    input.current?.focus({ preventScroll: true });
    if (myTurn && lang === 'en') speak(item.text, settings.speechRate, 'en').catch(reportSpeechError);
  }, [moveKey, myTurn]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!typed.trim()) return;
    if (!myTurn) return setTyped('');
    onSubmit(typed);
    // A wrong guess keeps the turn: clear the box for another try.
    setTyped('');
  };

  return (
    <div className={`duel-stage${low && myTurn ? ' low' : ''}`} style={{ ['--heat' as string]: heat }}>
      <div className="duel-players">
        {players.map((p, k) => (
          <div key={k} className={`duel-player${p.name === moverName ? ' moving' : ''}`}>
            <div className="duel-name">{p.name}</div>
            <div className="duel-lives" aria-label={t('{n} lives left', { n: p.lives })}>
              {Array.from({ length: DUEL_LIVES }, (_, i) => (
                <span key={i} className={i < p.lives ? 'heart' : 'heart lost'} aria-hidden>♥</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="duel-heat" aria-hidden>
        <div style={{ width: `${heat * 100}%` }} />
      </div>
      <div className="small muted center" style={{ marginBottom: 6 }}>
        {t('{n} right · {s}s per word', { n: correct, s: seconds.toFixed(seconds % 1 ? 1 : 0) })}
      </div>

      <div className={`duel-card${feedback ? (feedback.ok ? ' ok' : ' bad') : ''}`}>
        {steal && <div className="duel-steal">{t('Steal! One chance')}</div>}
        {lang === 'zh' ? (
          <div className="duel-word zh" lang="zh-CN" key={`${item.id}-${moveKey}`}>{item.text}</div>
        ) : (
          <div className="duel-word duel-gloss" lang="zh-CN" key={`${item.id}-${moveKey}`}>
            {shortGloss(item.gloss)}
            <button className="icon-btn" aria-label={t('Listen')} onClick={() => speak(item.text, settings.speechRate, 'en').catch(reportSpeechError)}><IconSpeaker /></button>
          </div>
        )}
        {feedback && <div className="duel-feedback" role="status">{feedback.text}</div>}
      </div>

      {penalty && <div className="duel-penalty" key={penalty.key} role="status">{penalty.text}</div>}
      <div className={`duel-timer${low ? ' low' : ''}`} role="timer" aria-label={t('{s} seconds left', { s: Math.ceil(left / 1000) })}>
        <div style={{ width: `${Math.min(100, (left / (seconds * 1000)) * 100)}%` }} />
      </div>

      {!myTurn && <p className="center muted" role="status" style={{ margin: '0 0 8px' }}>{t('{name} is answering…', { name: moverName })}</p>}
      <form className="row duel-input" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input
          ref={input}
          className={`input grow${myTurn ? '' : ' waiting'}`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={myTurn ? (inputLang === 'zh' ? t('Type the pinyin') : t('Type the English word')) : t('Wait for your turn…')}
          aria-label={inputLang === 'zh' ? t('Type the pinyin') : t('Type the English word')}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          autoFocus
        />
        {/* Tapping Go mustn't take focus from the box, or the keyboard would close. */}
        <button className="btn primary" disabled={!myTurn || !typed.trim()} onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}>
          {t('Go')}
        </button>
      </form>
    </div>
  );
}

const LEVEL_KEY = 'dj:duel-level';

/** The duel difficulty last picked, remembered on this device. */
export function useDuelLevel(): [DuelLevel, (l: DuelLevel) => void] {
  const [level, setLevel] = useState<DuelLevel>(() => {
    try {
      return asDuelLevel(localStorage.getItem(LEVEL_KEY));
    } catch {
      return 'hard';
    }
  });
  const set = (l: DuelLevel) => {
    setLevel(l);
    try {
      localStorage.setItem(LEVEL_KEY, l);
    } catch {
      /* this visit only */
    }
  };
  return [level, set];
}

export const duelLevelName = (l: DuelLevel, t: (k: string) => string) => (l === 'easy' ? t('Easy') : l === 'medium' ? t('Medium') : t('Hard'));

/** Easy / Medium / Hard: how long each move gets, and how far the clock drops. */
export function DuelLevelPicker({ value, onChange }: { value: DuelLevel; onChange: (l: DuelLevel) => void }) {
  const t = useT();
  return (
    <>
      <div className="segmented" role="group" aria-label={t('Difficulty')} style={{ margin: '0 0 6px' }}>
        {(['easy', 'medium', 'hard'] as DuelLevel[]).map((l) => (
          <button key={l} className={value === l ? 'on' : ''} aria-pressed={value === l} onClick={() => onChange(l)}>
            {duelLevelName(l, t)}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ margin: '0 0 14px' }}>
        {t('{start} seconds per word at first, dropping to {min}.', { start: DUEL_LEVELS[value].start, min: DUEL_LEVELS[value].min })}
      </p>
    </>
  );
}
