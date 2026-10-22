import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getContent, useContent } from '../lib/content';
import { getState, useStore } from '../lib/store';
import { buildExtraPractice, buildSession, gradeCard, previewIntervals, REQUEUE_WINDOW_MS, type SessionItem } from '../lib/srs';
import { reportSpeechError, speak, ttsAvailable } from '../lib/tts';
import { IconClose, IconSpeaker } from '../components/Icons';
import WordBreakdown from '../components/WordBreakdown';
import type { Grade } from '../types';

interface QueueItem extends SessionItem {
  shown: number;
}

const MAX_REPEATS = 4;

export default function Review() {
  const [params] = useSearchParams();
  const extra = params.get('mode') === 'extra';
  const navigate = useNavigate();
  const content = useContent();
  const settings = useStore((s) => s.settings);

  const [queue, setQueue] = useState<QueueItem[]>(() => {
    const s = getState().settings;
    const c = getContent();
    const items = extra ? buildExtraPractice(c, s.studyLevels, s) : buildSession(c, s.studyLevels, s);
    return items.map((i) => ({ ...i, shown: 0 }));
  });
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState<Record<Grade, number>>({ 1: 0, 2: 0, 3: 0 });
  const [finished, setFinished] = useState(new Set<string>());

  const current = queue[0];
  const sentence = current ? content.byId.get(current.sid) : undefined;
  const intervals = useMemo(
    () => (current && revealed ? previewIntervals(current.sid, current.dir, settings) : null),
    [current, revealed, settings],
  );

  const grade = useCallback(
    (g: Grade) => {
      if (!current) return;
      const due = gradeCard(current.sid, current.dir, g, current.kind === 'extra');
      setTally((t) => ({ ...t, [g]: t[g] + 1 }));
      setRevealed(false);
      // Cards still in a short learning step (e.g. new cards, wrong answers) come back this session.
      const again = due.getTime() - Date.now() <= REQUEUE_WINDOW_MS && current.shown + 1 < MAX_REPEATS;
      if (!again) setFinished((f) => new Set(f).add(`${current.sid}|${current.dir}`));
      setQueue((q) => {
        const [head, ...rest] = q;
        if (!again) return rest;
        // Bring it back a few cards later (sooner if it was wrong).
        const pos = Math.min(rest.length, g === 1 ? 3 : 6);
        return [...rest.slice(0, pos), { ...head, shown: head.shown + 1 }, ...rest.slice(pos)];
      });
    },
    [current],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ['1', '2', '3'].includes(e.key)) grade(Number(e.key) as Grade);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, revealed, grade]);

  if (!current || !sentence) {
    const reviewed = tally[1] + tally[2] + tally[3];
    return (
      <div className="center-screen">
        <div className="card center" style={{ width: '100%', maxWidth: 420 }}>
          <h2 style={{ marginTop: 4 }}>{reviewed ? 'Session complete' : 'Nothing to review'}</h2>
          {reviewed > 0 ? (
            <>
              <p className="muted">
                {finished.size} cards, {reviewed} answers
              </p>
              <div className="grades" style={{ pointerEvents: 'none' }}>
                <div className="grade g1">{tally[1]}<span className="iv">Wrong</span></div>
                <div className="grade g2">{tally[2]}<span className="iv">Mostly right</span></div>
                <div className="grade g3">{tally[3]}<span className="iv">Right</span></div>
              </div>
            </>
          ) : (
            <p className="muted">There are no cards for this selection right now.</p>
          )}
          <div className="stack" style={{ marginTop: 18 }}>
            <button className="btn primary block" onClick={() => navigate('/')}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  const reading = current.dir === 'r';
  // Every answer moves the bar: answers so far out of answers so far plus answers still queued.
  const answers = tally[1] + tally[2] + tally[3];
  const progress = answers / (answers + queue.length);
  const left = new Set(queue.map((q) => `${q.sid}|${q.dir}`)).size;

  return (
    <>
      <div className="review-top">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="End session">
          <IconClose />
        </button>
        <div className="progress" aria-label={`${left} cards left`}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="small muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {left} left
        </span>
      </div>

      <div className="card flash" onClick={() => !revealed && setRevealed(true)} style={{ cursor: revealed ? 'default' : 'pointer' }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="dir-label">{reading ? 'Read · translate to English' : 'Produce · say it in Chinese'}</span>
          {current.kind === 'new' && current.shown === 0 && <span className="tag new">New</span>}
          {current.kind === 'extra' && <span className="tag">Extra</span>}
        </div>
        {reading ? <div className="prompt-zh">{sentence.zh}</div> : <div className="prompt-en">{sentence.en}</div>}

        {revealed && (
          <div className="answer">
            {reading ? <div className="answer-en">{sentence.en}</div> : <div className="answer-zh">{sentence.zh}</div>}
            <WordBreakdown sentence={sentence} lexicon={content.lexicon} />
            {ttsAvailable() && (
              <button
                className="btn ghost sm"
                style={{ marginTop: 10 }}
                onClick={(e) => {
                  e.stopPropagation();
                  speak(sentence.zh, settings.speechRate).catch(reportSpeechError);
                }}
              >
                <IconSpeaker /> Listen
              </button>
            )}
          </div>
        )}
      </div>

      {revealed ? (
        <div className="grades">
          <button className="grade g1" onClick={() => grade(1)}>
            Wrong<span className="iv">{intervals?.[1]}</span>
          </button>
          <button className="grade g2" onClick={() => grade(2)}>
            Mostly right<span className="iv">{intervals?.[2]}</span>
          </button>
          <button className="grade g3" onClick={() => grade(3)}>
            Right<span className="iv">{intervals?.[3]}</span>
          </button>
        </div>
      ) : (
        <button className="btn primary block" style={{ marginTop: 14, minHeight: 60 }} onClick={() => setRevealed(true)}>
          Show answer
        </button>
      )}
    </>
  );
}
