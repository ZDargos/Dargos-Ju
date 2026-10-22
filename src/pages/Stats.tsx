import { useMemo, useState } from 'react';
import { useContent } from '../lib/content';
import { useStore } from '../lib/store';
import { activity, dueForecast, hardestSentences, levelProgress, logsFor, overallCounts, retentionRate, streak, termDifficulty, type TermStat } from '../lib/stats';
import { lexiconFor, lookup, project } from '../lib/learn';
import { langParams, levelName, useT, useUiLang } from '../i18n';
import { BarChart, BucketLegend, StackedBar } from '../components/Charts';
import { PinyinText, PinyinToggle, usePinyin } from '../components/Pinyin';
import type { Dir } from '../types';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function DirToggle({ value, onChange }: { value: Dir; onChange: (d: Dir) => void }) {
  const t = useT();
  return (
    <div className="segmented" style={{ maxWidth: 260 }} role="group" aria-label={t('Card direction')}>
      <button className={value === 'r' ? 'on' : ''} aria-pressed={value === 'r'} onClick={() => onChange('r')}>{t('Reading')}</button>
      <button className={value === 'p' ? 'on' : ''} aria-pressed={value === 'p'} onClick={() => onChange('p')}>{t('Producing')}</button>
    </div>
  );
}

export default function Stats() {
  const t = useT();
  const uiLang = useUiLang();
  const locale = uiLang === 'zh' ? 'zh-CN' : undefined;
  const content = useContent();
  const cards = useStore((s) => s.cards);
  const allLogs = useStore((s) => s.logs);
  const settings = useStore((s) => s.settings);
  const lang = settings.learning;
  const pinyin = usePinyin('stats');
  const lexicon = lexiconFor(content, lang);
  const names = langParams(lang);

  const [levelDir, setLevelDir] = useState<Dir>('r');
  const [hardDir, setHardDir] = useState<Dir>('r');
  const [termDir, setTermDir] = useState<Dir>('r');
  const [termKind, setTermKind] = useState<'words' | 'chars'>('words');
  const [openTerm, setOpenTerm] = useState<string | null>(null);

  // Everything on this page is for the current learning mode.
  const logs = useMemo(() => logsFor(allLogs, lang), [allLogs, lang]);
  const overall = useMemo(() => overallCounts(content, cards, lang), [content, cards, lang]);
  const levels = useMemo(() => levelProgress(content, cards, lang), [content, cards, lang]);
  const days30 = useMemo(() => activity(logs, 30), [logs]);
  const forecast = useMemo(() => dueForecast(content, cards, lang, 7), [content, cards, lang]);
  const retention = useMemo(() => retentionRate(logs, 30), [logs]);
  const streakDays = useMemo(() => streak(logs), [logs]);
  const hardest = useMemo(() => hardestSentences(content, cards, logs, settings, hardDir, lang, 10), [content, cards, logs, settings, hardDir, lang]);
  const terms = useMemo(() => termDifficulty(content, logs, lang), [content, logs, lang]);

  const kind = lang === 'zh' ? termKind : 'words';
  const totalCards = content.sentences.length * 2;
  const started = totalCards - overall.r.new - overall.p.new;
  const known = overall.r.mature + overall.p.mature;
  const termList: TermStat[] = terms[kind][termDir].filter((x) => x.seen >= 3).slice(0, 15);
  const targetLang = lang === 'zh' ? 'zh-CN' : 'en';
  const nativeLang = lang === 'zh' ? 'en' : 'zh-CN';

  if (!logs.length) {
    return (
      <>
        <header className="topbar"><h1>{t('Stats')}</h1></header>
        <div className="card empty">
          {t('Your stats appear here after your first study session.')}
          <br />
          {t('{n} sentences in {levels} levels are waiting.', { n: content.sentences.length, levels: content.levels.length })}
        </div>
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <h1>{t('Stats')}</h1>
        <span className="small muted">{t('Learning {target}', names)}</span>
      </header>

      <div className="stat-grid">
        <div className="stat"><div className="value">{started}</div><div className="label">{t('of {n} cards started', { n: totalCards })}</div></div>
        <div className="stat"><div className="value">{known}</div><div className="label">{t('cards known well')}</div></div>
        <div className="stat"><div className="value">{retention.rate === null ? '–' : pct(retention.rate)}</div><div className="label">{t('recall, last 30 days')}</div></div>
        <div className="stat"><div className="value">{streakDays}</div><div className="label">{t('day streak')}</div></div>
      </div>

      <div className="section-title">{t('Overall progress')}</div>
      <div className="card">
        <div className="spread small" style={{ marginBottom: 6 }}><strong>{t('Reading')}</strong><span className="muted">{t('{n} started', { n: content.sentences.length - overall.r.new })}</span></div>
        <StackedBar counts={overall.r} label={t('Reading')} />
        <div className="spread small" style={{ margin: '14px 0 6px' }}><strong>{t('Producing')}</strong><span className="muted">{t('{n} started', { n: content.sentences.length - overall.p.new })}</span></div>
        <StackedBar counts={overall.p} label={t('Producing')} />
        <div style={{ marginTop: 14 }}><BucketLegend /></div>
      </div>

      <div className="section-title">{t('Last 30 days')}</div>
      <div className="card">
        <BarChart
          data={days30.map((d) => ({
            label: new Date(d.date + 'T12:00').toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
            value: d.reviews,
            detail: d.reviews ? t('{n} answers, {p} right or mostly right', { n: d.reviews, p: pct(d.passed / d.reviews) }) : t('no study'),
          }))}
          xLabels={(i) => (i === 0 ? t('30d ago') : i === 29 ? t('Today') : null)}
        />
        <p className="small muted" style={{ margin: '8px 0 0' }}>{t('{n} answers in total. Tap a bar for details.', { n: logs.length })}</p>
      </div>

      <div className="section-title">{t('Due in the next 7 days')}</div>
      <div className="card">
        <BarChart
          height={90}
          showValues
          data={forecast.map((n, i) => {
            const d = new Date(Date.now() + i * 86_400_000);
            return { label: i === 0 ? t('Today') : d.toLocaleDateString(locale, { weekday: 'short' }), value: n, detail: t('{n} cards due', { n }) };
          })}
        />
      </div>

      <div className="section-title">{t('By level')}</div>
      <div className="card">
        <div style={{ marginBottom: 14 }}><DirToggle value={levelDir} onChange={setLevelDir} /></div>
        {levels.map((l) => {
          const c = l.counts[levelDir];
          return (
            <div key={l.level} className="level-row">
              <div className="spread small" style={{ marginBottom: 5 }}>
                <strong>{levelName(l.level)}</strong>
                <span className="muted">{t('{p} started · {n} known', { p: pct((l.total - c.new) / l.total), n: c.mature })}</span>
              </div>
              <StackedBar counts={c} label={levelName(l.level)} />
            </div>
          );
        })}
        <div style={{ marginTop: 14 }}><BucketLegend /></div>
      </div>

      <div className="section-title">{t('Hardest sentences')}</div>
      <div className="card">
        <DirToggle value={hardDir} onChange={setHardDir} />
        {hardest.length ? (
          <ul className="list" style={{ marginTop: 6 }}>
            {hardest.map((h) => {
              const ls = project(h.sentence, lang);
              return (
                <li key={h.sentence.id}>
                  <div className="spread" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 18 }}>
                        <PinyinText tokens={ls.tokens} text={ls.target} lexicon={lexicon} show={pinyin} lang={lang} style={{ justifyContent: 'flex-start' }} />
                      </div>
                      <div className="small muted" lang={nativeLang}>{ls.native}</div>
                    </div>
                    <div style={{ textAlign: 'right', flex: 'none' }}>
                      <div className="meter" aria-hidden><div style={{ width: pct(h.score) }} /></div>
                      <div className="small muted" style={{ marginTop: 4 }}>{t('{n} wrong · L{level}', { n: h.misses, level: h.sentence.level })}</div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty small">{t('Review some cards at least twice to see which are hardest.')}</p>
        )}
      </div>

      <div className="section-title">{kind === 'words' ? t('Hardest words') : t('Hardest characters')}</div>
      <div className="card">
        <div className="row wrap" style={{ gap: 8 }}>
          {lang === 'zh' && (
            <div className="segmented" style={{ maxWidth: 220 }}>
              <button className={termKind === 'words' ? 'on' : ''} aria-pressed={termKind === 'words'} onClick={() => setTermKind('words')}>{t('Words')}</button>
              <button className={termKind === 'chars' ? 'on' : ''} aria-pressed={termKind === 'chars'} onClick={() => setTermKind('chars')}>{t('Characters')}</button>
            </div>
          )}
          <DirToggle value={termDir} onChange={setTermDir} />
        </div>
        {termList.length ? (
          <ul className="list" style={{ marginTop: 6 }}>
            {termList.map((term) => {
              const lex = lookup(lexicon, term.term);
              const open = openTerm === term.term;
              const examples = open
                ? (kind === 'words'
                    ? (lang === 'zh' ? content.wordIndex : content.enWordIndex).get(term.term) ?? []
                    : content.sentences.filter((s) => s.zh.includes(term.term)).map((s) => s.id)
                  ).slice(0, 4)
                : [];
              return (
                <li key={term.term} onClick={() => setOpenTerm(open ? null : term.term)} style={{ cursor: 'pointer' }} aria-expanded={open}>
                  <div className="term-row">
                    <span className={`term${lang === 'en' ? ' en' : ''}`} lang={targetLang}>{term.term}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="small"><strong>{lex?.py ?? ''}</strong></div>
                      <div className="small muted" lang={nativeLang} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: open ? 'normal' : 'nowrap' }}>{lex?.en ?? ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="meter" aria-hidden><div style={{ width: pct(term.score) }} /></div>
                      <div className="small muted" style={{ marginTop: 4 }}>{t('{p} miss · {n}×', { p: pct(term.score), n: term.seen })}</div>
                    </div>
                  </div>
                  {open && (
                    <div style={{ marginTop: 8 }}>
                      {examples.map((id) => {
                        const s = project(content.byId.get(id)!, lang);
                        return (
                          <div key={id} style={{ marginTop: 6 }}>
                            <div className={lang === 'zh' ? 'zh' : ''} lang={targetLang}>{s.target}</div>
                            <div className="small muted" lang={nativeLang}>{s.native}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty small">{t("Words show up here once they've appeared in at least 3 graded sentences.")}</p>
        )}
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          {t('Miss rate counts Wrong as a full miss and Mostly right as part of one, weighting recent answers more.')}
        </p>
      </div>
      <PinyinToggle section="stats" aboveTabBar />
    </>
  );
}
