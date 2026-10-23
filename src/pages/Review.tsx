import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getContent, useContent } from '../lib/content';
import { getState, useStore } from '../lib/store';
import { buildExtraPractice, buildFullDeck, buildSession, cardKey, fullDeckProgress, gradeCard, markFullDeckDone, previewIntervals, REQUEUE_WINDOW_MS, setCardsHidden, type SessionItem, type StudyUnit } from '../lib/srs';
import { vocabItem, type VocabItem } from '../lib/vocab';
import { studyUnits } from '../lib/studyUnits';
import { updateSettings } from '../lib/store';
import { myVocab } from '../lib/myWords';
import DictPanel from '../components/DictPanel';
import { lexiconFor, project } from '../lib/learn';
import { reportSpeechError, speak, ttsAvailable } from '../lib/tts';
import { langName, useT } from '../i18n';
import { IconClose, IconSpeaker } from '../components/Icons';
import WordBreakdown from '../components/WordBreakdown';
import { useXp } from '../lib/useXp';
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
  // Full deck: every card of the selected levels once per pass, in the deck's shuffled order.
  const full = params.get('mode') === 'full';
  const words = params.get('deck') === 'words';
  const [dict, setDict] = useState<string | null>(null);
  const navigate = useNavigate();
  const content = useContent();
  const settings = useStore((s) => s.settings);
  const xp = useXp();
  const [xpAtStart] = useState(xp.total);
  const pinyin = usePinyin('study');
  // The session keeps the learning mode it started in.
  const [lang] = useState(() => getState().settings.learning);

  const [units] = useState<StudyUnit[]>(() => studyUnits(getContent(), getState().settings, words));
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    const s = getState().settings;
    const items = full ? buildFullDeck(units, s) : extra ? buildExtraPractice(units, s) : buildSession(units, s);
    return items.map((i) => ({ ...i, shown: 0 }));
  });
  const [deck, setDeck] = useState(() => (full ? fullDeckProgress(units, getState().settings) : { done: 0, total: 0 }));
  const [passDone, setPassDone] = useState(false);
  const [hiddenNote, setHiddenNote] = useState<QueueItem | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState<Record<Grade, number>>({ 1: 0, 2: 0, 3: 0 });
  const [finished, setFinished] = useState(new Set<string>());

  const current = queue[0];
  const source = current && !words ? content.byId.get(current.sid) : undefined;
  const sentence = source ? project(source, lang) : undefined;
  const word: VocabItem | undefined = current && words ? vocabItem(content, lang, current.sid) ?? myVocab(lang).find((v) => v.id === current.sid) : undefined;
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
      if (full) {
        // Each card once per pass.
        if (markFullDeckDone(units, { ...getState().settings, learning: lang }, current)) setPassDone(true);
        setDeck((d) => ({ ...d, done: d.done + 1 }));
      }
      // Cards still in a short learning step (e.g. new cards, wrong answers) come back this session.
      const again = !full && due.getTime() - Date.now() <= REQUEUE_WINDOW_MS && current.shown + 1 < MAX_REPEATS;
      if (!again) setFinished((f) => new Set(f).add(`${current.sid}|${current.dir}`));
      setQueue((q) => {
        const [head, ...rest] = q;
        if (!again) return rest;
        // Bring it back a few cards later (sooner if it was wrong).
        const pos = Math.min(rest.length, g === 1 ? 3 : 6);
        return [...rest.slice(0, pos), { ...head, shown: head.shown + 1 }, ...rest.slice(pos)];
      });
    },
    [current, lang, full, units],
  );

  /** Hides this card for good (this direction only); Undo brings it back. */
  const hideCurrent = () => {
    if (!current) return;
    const s = getState().settings;
    updateSettings(setCardsHidden([cardKey(current.sid, current.dir, lang)], true, s));
    setRevealed(false);
    setHiddenNote(current);
    setQueue((q) => q.filter((i) => !(i.sid === current.sid && i.dir === current.dir)));
    if (full) setDeck((d) => ({ ...d, total: Math.max(0, d.total - 1) }));
  };
  const undoHide = () => {
    if (!hiddenNote) return;
    updateSettings(setCardsHidden([cardKey(hiddenNote.sid, hiddenNote.dir, lang)], false, getState().settings));
    setQueue((q) => [hiddenNote, ...q]);
    if (full) setDeck((d) => ({ ...d, total: d.total + 1 }));
    setHiddenNote(null);
  };
  useEffect(() => {
    if (!hiddenNote) return;
    const timer = setTimeout(() => setHiddenNote(null), 6000);
    return () => clearTimeout(timer);
  }, [hiddenNote]);

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

  if (!current || (!sentence && !word)) {
    const reviewed = tally[1] + tally[2] + tally[3];
    return (
      <div className="center-screen">
        <div className="card center" style={{ width: '100%', maxWidth: 420 }} role="status">
          <h2 style={{ marginTop: 4 }}>{passDone ? t('Whole deck done!') : reviewed ? t('Session complete') : t('Nothing to review')}</h2>
          {passDone && <p className="muted">{t("You've been through every card in this deck. It will be shuffled for the next pass.")}</p>}
          {reviewed > 0 ? (
            <>
              <p className="muted">{t('{cards} cards, {answers} answers', { cards: finished.size, answers: reviewed })}</p>
              <p className="xp-earned">+{Math.max(0, xp.total - xpAtStart)} XP</p>
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
  const left = full ? Math.max(0, deck.total - deck.done) : new Set(queue.map((q) => `${q.sid}|${q.dir}`)).size;
  const progress = full ? (deck.total ? deck.done / deck.total : 0) : answers / (answers + queue.length);
  const targetIsZh = lang === 'zh';
  const names = { target: langName(lang), native: langName(targetIsZh ? 'en' : 'zh') };
  const spoken = word ? word.text : sentence!.target;
  const example = word?.exampleId ? content.byId.get(word.exampleId) : undefined;
  const exampleView = example ? project(example, lang) : undefined;
  const target = word ? (
    <span className={`word-prompt${targetIsZh ? ' zh' : ''}`} lang={targetIsZh ? 'zh-CN' : 'en'}>
      {pinyin && reading && <span className="word-py">{word.py}</span>}
      {word.text}
    </span>
  ) : (
    <PinyinText tokens={sentence!.tokens} text={sentence!.target} lexicon={lexicon} show={pinyin} lang={lang} />
  );
  const native = <span lang={targetIsZh ? 'en' : 'zh-CN'}>{word ? word.gloss : sentence!.native}</span>;

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
          {full ? `${deck.done}/${deck.total}` : t('{n} left', { n: left })}
        </span>
      </div>

      <div className="card flash" onClick={() => !revealed && setRevealed(true)} style={{ cursor: revealed ? 'default' : 'pointer' }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="dir-label">
            {word
              ? reading
                ? t('Word · what does it mean?')
                : t('Word · say it in {target}', names)
              : reading
                ? t('Read · translate to {native}', names)
                : t('Produce · say it in {target}', names)}
          </span>
          {current.kind === 'new' && current.shown === 0 && <span className="tag new">{t('New')}</span>}
          {current.kind === 'extra' && <span className="tag">{t('Extra')}</span>}
          <span className="grow" />
          <button
            className="btn ghost sm hide-card"
            onClick={(e) => {
              e.stopPropagation();
              hideCurrent();
            }}
            title={reading ? t('Hide this reading card') : t('Hide this producing card')}
          >
            {t('Hide')}
          </button>
        </div>
        {/* Reading shows the language being learned; producing shows your own language. */}
        <div className={reading === targetIsZh ? 'prompt-zh' : 'prompt-en'}>{reading ? target : native}</div>

        {revealed && (
          <div className="answer" aria-live="polite">
            <div className={reading === targetIsZh ? 'answer-en' : 'answer-zh'}>{reading ? native : target}</div>
            {word ? (
              <div className="word-answer">
                <div className="word-answer-py">{word.py}</div>
                {exampleView && (
                  <div className="word-example">
                    <div className={targetIsZh ? 'zh' : ''} lang={targetIsZh ? 'zh-CN' : 'en'}>{exampleView.target}</div>
                    <div className="small muted" lang={targetIsZh ? 'en' : 'zh-CN'}>{exampleView.native}</div>
                  </div>
                )}
                <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setDict(word.text); }}>{t('Dictionary')}</button>
              </div>
            ) : (
              <WordBreakdown sentence={sentence!} lexicon={lexicon} />
            )}
            {ttsAvailable() && (
              <button
                className="btn ghost sm"
                style={{ marginTop: 10 }}
                onClick={(e) => {
                  e.stopPropagation();
                  speak(spoken, settings.speechRate, lang).catch(reportSpeechError);
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
      {hiddenNote && (
        <div className="banner hidden-note" role="status">
          <span className="grow">{hiddenNote.dir === 'r' ? t('Reading card hidden. Bring it back any time from Manage cards.') : t('Producing card hidden. Bring it back any time from Manage cards.')}</span>
          <button className="btn sm" onClick={undoHide}>{t('Undo')}</button>
        </div>
      )}
      {dict && <DictPanel word={dict} lang={lang} onClose={() => setDict(null)} />}
    </>
  );
}
