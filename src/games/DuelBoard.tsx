import { useEffect, useRef, useState } from 'react';
import { DUEL_LIVES, duelIntensity, shortGloss } from '../lib/vocabGame';
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
  onSubmit: (typed: string) => void;
}

/** The duel screen: lives, the word, the shrinking clock and the answer box. Heats up as correct answers pile up. */
export default function DuelBoard({ item, lang, myTurn, steal, deadline, seconds, correct, players, moverName, feedback, onSubmit }: Props) {
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

  // New word: clear the box, focus it on my move, and in English mode say the word to spell.
  useEffect(() => {
    setTyped('');
    if (myTurn) {
      input.current?.focus();
      if (lang === 'en') speak(item.text, settings.speechRate, 'en').catch(reportSpeechError);
    }
  }, [item.id, myTurn, deadline]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!myTurn || !typed.trim()) return;
    onSubmit(typed);
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
          <div className="duel-word zh" lang="zh-CN" key={item.id + deadline}>{item.text}</div>
        ) : (
          <div className="duel-word duel-gloss" lang="zh-CN" key={item.id + deadline}>
            {shortGloss(item.gloss)}
            <button className="icon-btn" aria-label={t('Listen')} onClick={() => speak(item.text, settings.speechRate, 'en').catch(reportSpeechError)}><IconSpeaker /></button>
          </div>
        )}
        {feedback && <div className="duel-feedback" role="status">{feedback.text}</div>}
      </div>

      <div className={`duel-timer${low ? ' low' : ''}`} role="timer" aria-label={t('{s} seconds left', { s: Math.ceil(left / 1000) })}>
        <div style={{ width: `${Math.min(100, (left / (seconds * 1000)) * 100)}%` }} />
      </div>

      {myTurn ? (
        <form className="row duel-input" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input
            ref={input}
            className="input grow"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={lang === 'zh' ? t('Type the pinyin') : t('Type the English word')}
            aria-label={lang === 'zh' ? t('Type the pinyin') : t('Type the English word')}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="send"
          />
          <button className="btn primary" disabled={!typed.trim()}>{t('Go')}</button>
        </form>
      ) : (
        <p className="center muted" role="status">{t('{name} is answering…', { name: moverName })}</p>
      )}
    </div>
  );
}
