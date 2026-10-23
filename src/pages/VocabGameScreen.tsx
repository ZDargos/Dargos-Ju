import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContent } from '../lib/content';
import { useSettings } from '../lib/store';
import { gameName, MIN_VOCAB, vocabPoolFor, type GameDef } from '../games/registry';
import { recordRound } from '../lib/gameStats';
import { DUEL_LIVES, duelAnswerOk, duelSeconds, newSeed, wordSequence } from '../lib/vocabGame';
import { useT } from '../i18n';
import { IconClose } from '../components/Icons';
import { PinyinToggle, usePinyin } from '../components/Pinyin';
import SpeedRound, { SpeedAnswerPicker, useSpeedAnswer, type SpeedResult } from '../games/SpeedRound';
import DuelBoard from '../games/DuelBoard';

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
  // Best scores are kept per mode (definitions or pinyin/phonetics).
  const bestId = `${game.id}:${answer}`;
  const best = readBest(bestId, lang);

  const start = () => {
    setResult(null);
    setRun({ seed: newSeed(), startAt: Date.now() + 3000 });
  };

  return (
    <>
      <Top game={game} />
      {result ? (
        <div className="card center" role="status">
          <h2 style={{ marginTop: 4 }}>{t("Time's up!")}</h2>
          <div className="speed-final">{result.score}</div>
          <p className="muted">{t('{right} right, {wrong} wrong', { right: result.right, wrong: result.wrong })}</p>
          {result.record ? <p className="xp-earned">{t('New best!')}</p> : best !== null && <p className="small muted">{t('Best: {n}', { n: best })}</p>}
          <SpeedAnswerPicker value={answer} onChange={setAnswer} lang={lang} />
          <button className="btn accent block" onClick={start}>{t('Play again')}</button>
        </div>
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
          onAnswer={(ok, ms) => recordRound(game.id, 'solo', ok, ms, undefined, lang)}
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
  const [run, setRun] = useState<{ seed: number } | null>(null);
  const [n, setN] = useState(0);
  const [lives, setLives] = useState(DUEL_LIVES);
  const [correct, setCorrect] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [over, setOver] = useState<{ score: number; record: boolean } | null>(null);
  const shownAt = useRef(0);
  const seqRef = useRef<((i: number) => import('../lib/vocab').VocabItem) | null>(null);
  const seq = run ? seqRef.current : null;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const best = readBest(game.id, lang);

  const nextWord = (index: number, correctSoFar: number) => {
    setN(index);
    setFeedback(null);
    const ms = duelSeconds(correctSoFar) * 1000;
    setDeadline(Date.now() + ms);
    shownAt.current = Date.now();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => answer(null, index, correctSoFar), ms + 100);
  };

  const start = () => {
    setOver(null);
    setLives(DUEL_LIVES);
    setCorrect(0);
    const seed = newSeed();
    seqRef.current = wordSequence(pool, seed);
    setRun({ seed });
    nextWord(0, 0);
  };

  // `typed` is null on a timeout.
  function answer(typed: string | null, index: number, correctSoFar: number) {
    clearTimeout(timer.current);
    if (!seqRef.current) return;
    const item = seqRef.current(index);
    const ok = typed !== null && duelAnswerOk(typed, item, lang);
    recordRound(game.id, 'solo', ok, Date.now() - shownAt.current, undefined, lang);
    if (ok) {
      setCorrect(correctSoFar + 1);
      setFeedback({ ok: true, text: '✓' });
      setTimeout(() => nextWord(index + 1, correctSoFar + 1), 350);
      return;
    }
    const answerText = lang === 'zh' ? item.py : item.text;
    setFeedback({ ok: false, text: typed === null ? t("Time's up! It was {answer}", { answer: answerText }) : t('It was {answer}', { answer: answerText }) });
    setLives((l) => {
      const left = l - 1;
      if (left <= 0) {
        setTimeout(() => {
          setOver({ score: correctSoFar, record: saveBest(game.id, lang, correctSoFar) });
          setRun(null);
        }, 1400);
      } else setTimeout(() => nextWord(index + 1, correctSoFar), 1400);
      return left;
    });
  }

  return (
    <>
      <Top game={game} />
      {over ? (
        <div className="card center" role="status">
          <h2 style={{ marginTop: 4 }}>{t('Out of lives!')}</h2>
          <div className="speed-final">{over.score}</div>
          <p className="muted">{t('words right before your 4 lives ran out')}</p>
          {over.record ? <p className="xp-earned">{t('New best!')}</p> : best !== null && <p className="small muted">{t('Best: {n}', { n: best })}</p>}
          <button className="btn accent block" onClick={start}>{t('Play again')}</button>
        </div>
      ) : run && seq ? (
        <DuelBoard
          item={seq(n)}
          lang={lang}
          myTurn={!feedback}
          steal={false}
          deadline={deadline}
          seconds={duelSeconds(correct)}
          correct={correct}
          players={[{ name: t('You'), lives }]}
          moverName={t('You')}
          feedback={feedback}
          onSubmit={(typed) => answer(typed, n, correct)}
        />
      ) : (
        <div className="card center">
          <p>{lang === 'zh' ? t('Type the pinyin for each word before time runs out. Tones are optional.') : t('Spell the English word for each meaning before time runs out.')}</p>
          <p className="small muted">{t('Practice on your own: 4 lives, and the clock gets faster with every right answer. Play friends with Vs.')}</p>
          {best !== null && <p className="small muted">{t('Best: {n}', { n: best })}</p>}
          <button className="btn accent block" onClick={start}>{t('Start')}</button>
        </div>
      )}
    </>
  );
}
