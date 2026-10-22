import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getContent, useContent } from '../lib/content';
import { getState, useStore } from '../lib/store';
import { buildExtraPractice, buildSession, gradeCard, previewIntervals, REQUEUE_WINDOW_MS, type SessionItem } from '../lib/srs';
import { lexiconFor, project } from '../lib/learn';
import { reportSpeechError, speak, ttsAvailable } from '../lib/tts';
import { langName, useT } from '../i18n';
import { IconClose, IconSpeaker } from '../components/Icons';
import WordBreakdown from '../components/WordBreakdown';
import { PinyinText, PinyinToggle, usePinyin } from '../components/Pinyin';
import type { Grade } from '../types';

interface QueueItem extends SessionItem {
  shown: number;
}

const MAX_REPEATS = 4;

export default function Review() {
  const t = useT();
  const [params] = useSearchParams();
  const extra = params.get('mode') === 'extra';
  const navigate = useNavigate();
  const content = useContent();
  const settings = useStore((s) => s.settings);
  const pinyin = usePinyin('study');
  // The session keeps the learning mode it started in.
  const [lang] = useState(() => getState().settings.learning);

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
  const source = current ? content.byId.get(current.sid) : undefined;
  const sentence = source ? project(source, lang) : undefined;
  const lexicon = lexiconFor(content, lang);
  const intervals = useMemo(
    () => (current && revealed ? previewIntervals(current.sid, current.dir, { ...settings, learning: lang }) : null),
    [current, revealed, settings, lang],
  );

  const grade = useCallback(
    (g: Grade) => {
      if (!current) return;
      const due = gradeCard(current.sid, current.dir, g, current.kind === 'extra', lang);
      setTally((x) => ({ ...x, [g]: x[g] + 1 }));
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
    [current, lang],
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
        <div className="card center" style={{ width: '100%', maxWidth: 420 }} role="status">
          <h2 style={{ marginTop: 4 }}>{reviewed ? t('Session complete') : t('Nothing to review')}</h2>
          {reviewed > 0 ? (
            <>
              <p className="muted">{t('{cards} cards, {answers} answers', { cards: finished.size, answers: reviewed })}</p>
              <div className="grades" style={{ pointerEvents: 'none' }}>
                <div className="grade g1">{tally[1]}<span className="iv">{t('Wrong')}</span></div>
                <div className="grade g2">{tally[2]}<span className="iv">{t('Mostly right')}</span></div>
                <div className="grade g3">{tally[3]}<span className="iv">{t('Right')}</span></div>
              </div>
            </>
          ) : (
            <p className="muted">{t('There are no cards for this selection right now.')}</p>
          )}
          <div className="stack" style={{ marginTop: 18 }}>
            <button className="btn primary block" onClick={() => navigate('/')}>{t('Done')}</button>
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
  const targetIsZh = lang === 'zh';
  const target = (
    <PinyinText tokens={sentence.tokens} text={sentence.target} lexicon={lexicon} show={pinyin} lang={lang} />
  );
  const native = <span lang={targetIsZh ? 'en' : 'zh-CN'}>{sentence.native}</span>;
  const names = { target: langName(lang), native: langName(targetIsZh ? 'en' : 'zh') };

  return (
    <>
      <div className="review-top">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label={t('End session')}>
          <IconClose />
        </button>
        <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={t('{n} cards left', { n: left })}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="small muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {t('{n} left', { n: left })}
        </span>
      </div>

      <div className="card flash" onClick={() => !revealed && setRevealed(true)} style={{ cursor: revealed ? 'default' : 'pointer' }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="dir-label">
            {reading ? t('Read · translate to {native}', names) : t('Produce · say it in {target}', names)}
          </span>
          {current.kind === 'new' && current.shown === 0 && <span className="tag new">{t('New')}</span>}
          {current.kind === 'extra' && <span className="tag">{t('Extra')}</span>}
        </div>
        {/* Reading shows the language being learned; producing shows your own language. */}
        <div className={reading === targetIsZh ? 'prompt-zh' : 'prompt-en'}>{reading ? target : native}</div>

        {revealed && (
          <div className="answer" aria-live="polite">
            <div className={reading === targetIsZh ? 'answer-en' : 'answer-zh'}>{reading ? native : target}</div>
            <WordBreakdown sentence={sentence} lexicon={lexicon} />
            {ttsAvailable() && (
              <button
                className="btn ghost sm"
                style={{ marginTop: 10 }}
                onClick={(e) => {
                  e.stopPropagation();
                  speak(sentence.target, settings.speechRate, lang).catch(reportSpeechError);
                }}
              >
                <IconSpeaker /> {t('Listen')}
              </button>
            )}
          </div>
        )}
      </div>

      {revealed ? (
        <div className="grades">
          <button className="grade g1" onClick={() => grade(1)}>
            ✗ {t('Wrong')}<span className="iv">{intervals?.[1]}</span>
          </button>
          <button className="grade g2" onClick={() => grade(2)}>
            ~ {t('Mostly right')}<span className="iv">{intervals?.[2]}</span>
          </button>
          <button className="grade g3" onClick={() => grade(3)}>
            ✓ {t('Right')}<span className="iv">{intervals?.[3]}</span>
          </button>
        </div>
      ) : (
        <button className="btn primary block" style={{ marginTop: 14, minHeight: 60 }} onClick={() => setRevealed(true)}>
          {t('Show answer')}
        </button>
      )}
      <PinyinToggle section="study" />
    </>
  );
}
