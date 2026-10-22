import { levelName, useT } from '../i18n';
import type { Level } from '../types';

interface Props {
  levels: Level[];
  selected: number[];
  onChange: (levels: number[]) => void;
}

export default function LevelPicker({ levels, selected, onChange }: Props) {
  const t = useT();
  const set = new Set(selected);
  const all = levels.length > 0 && levels.every((l) => set.has(l.level));
  const toggle = (level: number) => {
    const next = new Set(set);
    if (next.has(level)) next.delete(level);
    else next.add(level);
    onChange([...next].sort((a, b) => a - b));
  };
  return (
    <div>
      <div className="spread" style={{ marginBottom: 10 }}>
        <span className="small muted">{selected.length ? t('{n} of {total} levels', { n: selected.length, total: levels.length }) : t('Pick one or more levels')}</span>
        <button className="btn ghost sm" onClick={() => onChange(all ? [] : levels.map((l) => l.level))}>
          {all ? t('Clear') : t('Select all')}
        </button>
      </div>
      <div className="chips" role="group" aria-label={t('Levels')}>
        {levels.map((l) => (
          <button
            key={l.level}
            className={`chip${set.has(l.level) ? ' on' : ''}`}
            onClick={() => toggle(l.level)}
            aria-pressed={set.has(l.level)}
            aria-label={t('{level}, {n} sentences', { level: levelName(l.level), n: l.count })}
          >
            {levelName(l.level)}
            <span className="count">{l.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
