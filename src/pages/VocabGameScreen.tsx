import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContent } from '../lib/content';
import { useSettings } from '../lib/store';
import { gameName, MIN_VOCAB, vocabPoolFor, type GameDef } from '../games/registry';
import { recordRound } from '../lib/gameStats';
import { DUEL_LIVES, duelAnswerOk, duelSeconds, newSeed, readingsOf, WRONG_GUESS_PENALTY, wordSequence, type DuelLevel } from '../lib/vocabGame';
import VocabSummary, { type WordResult } from '../components/VocabSummary';
import type { VocabItem } from '../lib/vocab';
import { useT } from '../i18n';
import { IconClose } from '../components/Icons';
import { PinyinToggle, usePinyin } from '../components/Pinyin';
import SpeedRound, { SpeedAnswerPicker, useSpeedAnswer, type SpeedResult } from '../games/SpeedRound';
import DuelBoard, { DuelLevelPicker, useDuelLevel } from '../games/DuelBoard';

const bestKey = (game: string, lang: string) => `dj:best:${game}:${lang}`;
function readBest(game: string, lang: string): number | null {
  try {
    const v = localStorage.getItem(bestKey(game, lang));
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}
function saveBest(game: string, lang: string, score: number): boolean {
  const best = readBest(game, lang);
  if (best !== null ? score <= best : score <= 0) return false;
  try {
    localStorage.setItem(bestKey(game, lang), String(score));
  } catch {
    /* not remembered */
  }
  return true;
}

function Top({ game }: { game: GameDef }) {
  const t = useT();
  const navigate = useNavigate();
  const lang = useSettings().learning;
  return (
    <div className="review-top">
      <button className="icon-btn" onClick={() => navigate('/games')} aria-label={t('Back to games')}><IconClose /></button>
      <strong className="grow">{gameName(game, lang)}</strong>
    </div>
  );
}

/** Practice for the vocabulary games: Speed round, Reverse speed round, or duel survival. */
export default function VocabGameScreen({ game }: { game: GameDef }) {
  const t = useT();
  const content = useContent();
  const settings = useSettings();
  const lang = settings.learning;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pool = useMemo(() => vocabPoolFor(content, settings, lang), [content, settings.gameLevels.join(','), lang]);
  if (pool.length < MIN_VOCAB)
    return (
      <>
        <Top game={game} />
        <div className="card empty">{t('Pick more levels on the Games page: this game needs at least {n} words.', { n: MIN_VOCAB })}</div>
      </>
    );
  return game.kind === 'duel' ? <DuelSurvival game={game} pool={pool} /> : <SpeedPractice game={game} pool={pool} />;
}

function SpeedPractice({ game, pool }: { game: GameDef; pool: ReturnType<typeof vocabPoolFor> }) {
  const t = useT();
  const lang = useSettings().learning;
  const pinyin = usePinyin(game.id);
  const [run, setRun] = useState<{ seed: number; startAt: number } | null>(null);
  const [result, setResult] = useState<(SpeedResult & { record: boolean }) | null>(null);
  const [answer, setAnswer] = useSpeedAnswer(game.id, lang);
  const [words, setWords] = useState<WordResult[]>([]);
  // Best scores are kept per mode (definitions or pinyin/phonetics).
  const bestId = `${game.id}:${answer}`;
  const best = readBest(bestId, lang);

  const start = () => {
    setResult(null);
    setWords([]);
    setRun({ seed: newSeed(), startAt: Date.now() + 3000 });
  };

  return (
    <>
      <Top game={game} />
      {result ? (
        <>
        <div className="card center" role="status">
          <h2 style={{ marginTop: 4 }}>{t("Time's up!")}</h2>
          <div className="speed-final">{result.score}</div>
          <p className="muted">{t('{right} right, {wrong} wrong', { right: result.right, wrong: result.wrong })}</p>
          {result.record ? <p className="xp-earned">{t('New best!')}</p> : best !== null && <p className="small muted">{t('Best: {n}', { n: best })}</p>}
          <SpeedAnswerPicker value={answer} onChange={setAnswer} lang={lang} />
          <button className="btn accent block" onClick={start}>{t('Play again')}</button>
        </div>
        <VocabSummary results={words} />
        </>
      ) : run ? (
        <SpeedRound
          key={run.seed}
          pool={pool}
          seed={run.seed}
          direction={game.id === 'speed-word' ? 'word' : 'meaning'}
          answer={answer}
          lang={lang}
          showPy={pinyin}
          startAt={run.startAt}
          onAnswer={(ok, ms, _score, _answered, item) => {
            recordRound(game.id, 'solo', ok, ms, undefined, lang);
            setWords((w) => [...w, { item, ok }]);
          }}
          onDone={(r) => {
            setResult({ ...r, record: saveBest(bestId, lang, r.score) });
            setRun(null);
          }}
        />
      ) : (
        <div className="card center">
          <p>{t(game.description, { target: t(lang === 'zh' ? 'Chinese' : 'English') })}</p>
          <SpeedAnswerPicker value={answer} onChange={setAnswer} lang={lang} />
          {best !== null && <p className="small muted">{t('Best: {n}', { n: best })}</p>}
          <button className="btn accent block" onClick={start}>{t('Start')}</button>
        </div>
      )}
      {game.id === 'speed-meaning' && <PinyinToggle section={game.id} />}
    </>
  );
}

function DuelSurvival({ game, pool }: { game: GameDef; pool: ReturnType<typeof vocabPoolFor> }) {
  const t = useT();
  const lang = useSettings().learning;
  const [level, setLevel] = useDuelLevel();
  const [run, setRun] = useState<{ seed: number; level: DuelLevel } | null>(null);
  const [n, setN] = useState(0);
  const [lives, setLives] = useState(DUEL_LIVES);
  const [correct, setCorrect] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [penalty, setPenalty] = useState<{ text: string; key: number } | null>(null);
  const [results, setResults] = useState<WordResult[]>([]);
  const [over, setOver] = useState<{ score: number; record: boolean } | null>(null);
  const shownAt = useRef(0);
  const deadlineRef = useRef(0);
  const busy = useRef(false);
  const state = useRef({ index: 0, correct: 0, level: 'hard' as DuelLevel });
  const seqRef = useRef<((i: number) => VocabItem) | null>(null);
  const seq = run ? seqRef.current : null;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Best scores are kept per difficulty.
  const bestId = `${game.id}:${level}`;
  const best = readBest(bestId, lang);

  const armTimer = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => timeUp(), Math.max(0, deadlineRef.current - Date.now()) + 100);
  };

  const nextWord = (index: number, correctSoFar: number) => {
    state.current = { ...state.current, index, correct: correctSoFar };
    busy.current = false;
    setN(index);
    setFeedback(null);
    setPenalty(null);
    deadlineRef.current = Date.now() + duelSeconds(correctSoFar, state.current.level) * 1000;
    setDeadline(deadlineRef.current);
    shownAt.current = Date.now();
    armTimer();
  };

  const start = () => {
    setOver(null);
    setLives(DUEL_LIVES);
    setCorrect(0);
    setResults([]);
    const seed = newSeed();
    seqRef.current = wordSequence(pool, seed);
    state.current = { index: 0, correct: 0, level };
    setRun({ seed, level });
    nextWord(0, 0);
  };

  /** Running out of time costs a life. */
  function timeUp() {
    clearTimeout(timer.current);
    const { index, correct: soFar } = state.current;
    const item = seqRef.current?.(index);
    if (!item || busy.current) return;
    busy.current = true;
    recordRound(game.id, 'solo', false, Date.now() - shownAt.current, undefined, lang);
    setResults((r) => [...r, { item, ok: false }]);
    setFeedback({ ok: false, text: t("Time's up! It was {answer}", { answer: lang === 'zh' ? readingsOf(item) : item.text }) });
    setLives((l) => {
      const left = l - 1;
      if (left <= 0) {
        setTimeout(() => {
          setOver({ score: soFar, record: saveBest(bestId, lang, soFar) });
          setRun(null);
        }, 1600);
      } else setTimeout(() => nextWord(index + 1, soFar), 1600);
      return left;
    });
  }

  /** A right answer moves on; a wrong guess takes time off the clock and the player tries again. */
  function guess(typed: string) {
    const { index, correct: soFar, level: lv } = state.current;
    const item = seqRef.current?.(index);
    if (!item || busy.current) return;
    if (duelAnswerOk(typed, item, lang)) {
      busy.current = true;
      clearTimeout(timer.current);
      recordRound(game.id, 'solo', true, Date.now() - shownAt.current, undefined, lang);
      setResults((r) => [...r, { item, ok: true }]);
      setCorrect(soFar + 1);
      setFeedback({ ok: true, text: '✓' });
      setTimeout(() => nextWord(index + 1, soFar + 1), 350);
      return;
    }
    const cut = WRONG_GUESS_PENALTY * duelSeconds(soFar, lv) * 1000;
    deadlineRef.current = Math.max(Date.now(), deadlineRef.current - cut);
    setDeadline(deadlineRef.current);
    setPenalty({ text: t('Wrong: −{s}s', { s: Number((cut / 1000).toFixed(1)) }), key: Date.now() });
    armTimer();
  }

  return (
    <>
      <Top game={game} />
      {over ? (
        <>
          <div className="card center" role="status">
            <h2 style={{ marginTop: 4 }}>{t('Out of lives!')}</h2>
            <div className="speed-final">{over.score}</div>
            <p className="muted">{t('words right before your 4 lives ran out')}</p>
            {over.record ? <p className="xp-earned">{t('New best!')}</p> : best !== null && <p className="small muted">{t('Best: {n}', { n: best })}</p>}
            <DuelLevelPicker value={level} onChange={setLevel} />
            <button className="btn accent block" onClick={start}>{t('Play again')}</button>
          </div>
          <VocabSummary results={results} />
        </>
      ) : run && seq ? (
        <DuelBoard
          item={seq(n)}
          lang={lang}
          myTurn={!feedback}
          steal={false}
          deadline={deadline}
          seconds={duelSeconds(correct, run.level)}
          correct={correct}
          players={[{ name: t('You'), lives }]}
          moverName={t('You')}
          feedback={feedback}
          moveKey={n}
          penalty={penalty}
          onSubmit={guess}
        />
      ) : (
        <div className="card center">
          <p>{lang === 'zh' ? t('Type the pinyin for each word before time runs out. Tones are optional.') : t('Spell the English word for each meaning before time runs out.')}</p>
          <p className="small muted">{t('Practice on your own: 4 lives. A wrong guess costs a little time; running out of time costs a life. The clock gets faster with every right answer.')}</p>
          <DuelLevelPicker value={level} onChange={setLevel} />
          {best !== null && <p className="small muted">{t('Best: {n}', { n: best })}</p>}
          <button className="btn accent block" onClick={start}>{t('Start')}</button>
        </div>
      )}
    </>
  );
}
