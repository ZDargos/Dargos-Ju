import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useContent } from '../lib/content';
import { useSettings } from '../lib/store';
import { gameById, poolFor } from '../games/registry';
import { IconClose } from '../components/Icons';
import { recordRound } from '../lib/gameStats';
import type { Sentence } from '../types';

export default function GameScreen() {
  const { id = '' } = useParams();
  const game = gameById(id);
  const content = useContent();
  const settings = useSettings();
  const navigate = useNavigate();
  const pool = useMemo(() => (game ? poolFor(game, content, settings) : []), [game, content, settings]);
  const recent = useRef<string[]>([]);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState({ right: 0, total: 0, streak: 0, best: 0 });
  const roundStart = useRef(Date.now());
  useEffect(() => {
    roundStart.current = Date.now();
  }, [round]);

  const sentence = useMemo<Sentence | undefined>(() => {
    if (!pool.length) return undefined;
    // Avoid repeating any of the last few sentences.
    const avoid = new Set(recent.current);
    const fresh = pool.filter((s) => !avoid.has(s.id));
    const s = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length ? fresh.length : pool.length))];
    recent.current = [...recent.current, s.id].slice(-Math.min(20, Math.floor(pool.length / 2)));
    return s;
    // A new sentence only when the round changes.
  }, [round, pool.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!game?.component) return <Navigate to="/games" replace />;
  const Game = game.component;

  return (
    <>
      <div className="review-top">
        <button className="icon-btn" onClick={() => navigate('/games')} aria-label="Back to games">
          <IconClose />
        </button>
        <strong className="grow">{game.title}</strong>
        <div className="score-bar">
          <span>{score.right}/{score.total}</span>
          {score.streak > 1 && <span>🔥 {score.streak}</span>}
        </div>
      </div>
      {sentence ? (
        <Game
          key={round}
          sentence={sentence}
          pool={pool}
          content={content}
          settings={settings}
          hints={settings.hints[game.id as keyof typeof settings.hints] ?? false}
          onResult={(ok) => {
            recordRound(game.id, 'solo', ok, Date.now() - roundStart.current);
            setScore((s) => {
              const streak = ok ? s.streak + 1 : 0;
              return { right: s.right + (ok ? 1 : 0), total: s.total + 1, streak, best: Math.max(s.best, streak) };
            });
          }}
          onNext={() => setRound((r) => r + 1)}
        />
      ) : (
        <div className="card empty">No sentences fit this game for the selected levels.</div>
      )}
    </>
  );
}
