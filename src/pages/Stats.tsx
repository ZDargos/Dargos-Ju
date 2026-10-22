import { useMemo, useState } from 'react';
import { useContent } from '../lib/content';
import { useStore } from '../lib/store';
import { activity, dueForecast, hardestSentences, levelProgress, overallCounts, retentionRate, streak, termDifficulty, type TermStat } from '../lib/stats';
import { BarChart, BucketLegend, StackedBar } from '../components/Charts';
import { PinyinText, PinyinToggle, usePinyin } from '../components/Pinyin';
import type { Dir } from '../types';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DirToggle({ value, onChange }: { value: Dir; onChange: (d: Dir) => void }) {
  return (
    <div className="segmented" style={{ maxWidth: 260 }}>
      <button className={value === 'r' ? 'on' : ''} onClick={() => onChange('r')}>Reading</button>
      <button className={value === 'p' ? 'on' : ''} onClick={() => onChange('p')}>Producing</button>
    </div>
  );
}

export default function Stats() {
  const content = useContent();
  const cards = useStore((s) => s.cards);
  const logs = useStore((s) => s.logs);
  const settings = useStore((s) => s.settings);
  const pinyin = usePinyin('stats');

  const [levelDir, setLevelDir] = useState<Dir>('r');
  const [hardDir, setHardDir] = useState<Dir>('r');
  const [termDir, setTermDir] = useState<Dir>('r');
  const [termKind, setTermKind] = useState<'words' | 'chars'>('words');
  const [openTerm, setOpenTerm] = useState<string | null>(null);

  const overall = useMemo(() => overallCounts(content, cards), [content, cards]);
  const levels = useMemo(() => levelProgress(content, cards), [content, cards]);
  const days30 = useMemo(() => activity(logs, 30), [logs]);
  const forecast = useMemo(() => dueForecast(content, cards, 7), [content, cards]);
  const retention = useMemo(() => retentionRate(logs, 30), [logs]);
  const streakDays = useMemo(() => streak(logs), [logs]);
  const hardest = useMemo(() => hardestSentences(content, cards, logs, settings, hardDir, 10), [content, cards, logs, settings, hardDir]);
  const terms = useMemo(() => termDifficulty(content, logs), [content, logs]);

  const totalCards = content.sentences.length * 2;
  const started = totalCards - overall.r.new - overall.p.new;
  const known = overall.r.mature + overall.p.mature;
  const termList: TermStat[] = terms[termKind][termDir].filter((t) => t.seen >= 3).slice(0, 15);

  if (!logs.length) {
    return (
      <>
        <header className="topbar"><h1>Stats</h1></header>
        <div className="card empty">
          Your stats appear here after your first study session.
          <br />
          {content.sentences.length} sentences in {content.levels.length} levels are waiting.
        </div>
      </>
    );
  }

  return (
    <>
      <header className="topbar"><h1>Stats</h1></header>

      <div className="stat-grid">
        <div className="stat"><div className="value">{started}</div><div className="label">of {totalCards} cards started</div></div>
        <div className="stat"><div className="value">{known}</div><div className="label">cards known well</div></div>
        <div className="stat"><div className="value">{retention.rate === null ? '–' : pct(retention.rate)}</div><div className="label">recall, last 30 days</div></div>
        <div className="stat"><div className="value">{streakDays}</div><div className="label">day streak</div></div>
      </div>

      <div className="section-title">Overall progress</div>
      <div className="card">
        <div className="spread small" style={{ marginBottom: 6 }}><strong>Reading</strong><span className="muted">{content.sentences.length - overall.r.new} started</span></div>
        <StackedBar counts={overall.r} label="Reading" />
        <div className="spread small" style={{ margin: '14px 0 6px' }}><strong>Producing</strong><span className="muted">{content.sentences.length - overall.p.new} started</span></div>
        <StackedBar counts={overall.p} label="Producing" />
        <div style={{ marginTop: 14 }}><BucketLegend /></div>
      </div>

      <div className="section-title">Last 30 days</div>
      <div className="card">
        <BarChart
          data={days30.map((d) => ({
            label: new Date(d.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            value: d.reviews,
            detail: d.reviews ? `${d.reviews} answers, ${pct(d.passed / d.reviews)} right or mostly right` : 'no study',
          }))}
          xLabels={(i) => (i === 0 ? '30d ago' : i === 29 ? 'Today' : null)}
        />
        <p className="small muted" style={{ margin: '8px 0 0' }}>{logs.length} answers in total. Tap a bar for details.</p>
      </div>

      <div className="section-title">Due in the next 7 days</div>
      <div className="card">
        <BarChart
          height={90}
          showValues
          data={forecast.map((n, i) => {
            const d = new Date(Date.now() + i * 86_400_000);
            return { label: i === 0 ? 'Today' : WEEKDAY[d.getDay()], value: n, detail: `${n} cards due` };
          })}
        />
      </div>

      <div className="section-title">By level</div>
      <div className="card">
        <div style={{ marginBottom: 14 }}><DirToggle value={levelDir} onChange={setLevelDir} /></div>
        {levels.map((l) => {
          const c = l.counts[levelDir];
          return (
            <div key={l.level} className="level-row">
              <div className="spread small" style={{ marginBottom: 5 }}>
                <strong>{l.name}</strong>
                <span className="muted">{pct((l.total - c.new) / l.total)} started · {c.mature} known</span>
              </div>
              <StackedBar counts={c} label={l.name} />
            </div>
          );
        })}
        <div style={{ marginTop: 14 }}><BucketLegend /></div>
      </div>

      <div className="section-title">Hardest sentences</div>
      <div className="card">
        <DirToggle value={hardDir} onChange={setHardDir} />
        {hardest.length ? (
          <ul className="list" style={{ marginTop: 6 }}>
            {hardest.map((h) => (
              <li key={h.sentence.id}>
                <div className="spread" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 18 }}>
                      <PinyinText tokens={h.sentence.tokens} text={h.sentence.zh} lexicon={content.lexicon} show={pinyin} style={{ justifyContent: 'flex-start' }} />
                    </div>
                    <div className="small muted">{h.sentence.en}</div>
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <div className="meter"><div style={{ width: pct(h.score) }} /></div>
                    <div className="small muted" style={{ marginTop: 4 }}>{h.misses} wrong · L{h.sentence.level}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty small">Review some cards at least twice to see which are hardest.</p>
        )}
      </div>

      <div className="section-title">Hardest {termKind === 'words' ? 'words' : 'characters'}</div>
      <div className="card">
        <div className="row wrap" style={{ gap: 8 }}>
          <div className="segmented" style={{ maxWidth: 220 }}>
            <button className={termKind === 'words' ? 'on' : ''} onClick={() => setTermKind('words')}>Words</button>
            <button className={termKind === 'chars' ? 'on' : ''} onClick={() => setTermKind('chars')}>Characters</button>
          </div>
          <DirToggle value={termDir} onChange={setTermDir} />
        </div>
        {termList.length ? (
          <ul className="list" style={{ marginTop: 6 }}>
            {termList.map((t) => {
              const lex = content.lexicon[t.term];
              const open = openTerm === t.term;
              const examples = open
                ? (termKind === 'words'
                    ? content.wordIndex.get(t.term) ?? []
                    : content.sentences.filter((s) => s.zh.includes(t.term)).map((s) => s.id)
                  ).slice(0, 4)
                : [];
              return (
                <li key={t.term} onClick={() => setOpenTerm(open ? null : t.term)} style={{ cursor: 'pointer' }}>
                  <div className="term-row">
                    <span className="term">{t.term}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="small"><strong>{lex?.py ?? ''}</strong></div>
                      <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: open ? 'normal' : 'nowrap' }}>{lex?.en ?? ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="meter"><div style={{ width: pct(t.score) }} /></div>
                      <div className="small muted" style={{ marginTop: 4 }}>{pct(t.score)} miss · {t.seen}×</div>
                    </div>
                  </div>
                  {open && (
                    <div style={{ marginTop: 8 }}>
                      {examples.map((id) => {
                        const s = content.byId.get(id)!;
                        return (
                          <div key={id} style={{ marginTop: 6 }}>
                            <div className="zh">{s.zh}</div>
                            <div className="small muted">{s.en}</div>
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
          <p className="empty small">Words show up here once they've appeared in at least 3 graded sentences.</p>
        )}
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Miss rate counts Wrong as a full miss and Mostly right as part of one, weighting recent answers more.
        </p>
      </div>
      <PinyinToggle section="stats" aboveTabBar />
    </>
  );
}
