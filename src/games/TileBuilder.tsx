import { useMemo, useState } from 'react';
import { makeTiles, normalize, type Tile } from './common';
import type { LexEntry } from '../types';
import { IconUndo } from '../components/Icons';

interface Props {
  target: string[];
  distractors?: string[];
  lexicon: Record<string, LexEntry>;
  showPinyin?: boolean;
  allowHint?: boolean;
  /** Called once when the player checks the answer. */
  onChecked: (correct: boolean) => void;
  /** When false, the builder doesn't judge the answer (free building); onChecked gets true. */
  judge?: boolean;
  checkLabel?: string;
  onBuilt?: (text: string) => void;
}

/** Tap word tiles into order. Shared by Word order, Sentence builder and Dictation. */
export default function TileBuilder({ target, distractors = [], lexicon, showPinyin, allowHint, onChecked, judge = true, checkLabel = 'Check', onBuilt }: Props) {
  const bank = useMemo(() => makeTiles([...target, ...distractors]), [target, distractors]);
  const [placed, setPlaced] = useState<Tile[]>([]);
  const [result, setResult] = useState<null | boolean>(null);
  const used = new Set(placed.map((t) => t.id));
  const answer = normalize(target.join(''));

  const place = (t: Tile) => {
    if (result !== null || used.has(t.id)) return;
    setPlaced((p) => [...p, t]);
  };
  const remove = (t: Tile) => {
    if (result !== null) return;
    setPlaced((p) => p.filter((x) => x.id !== t.id));
  };
  const hint = () => {
    // Keep the correct prefix, then add the next correct tile.
    let prefixLen = 0;
    let built = '';
    for (const t of placed) {
      if (!answer.startsWith(normalize(built + t.text))) break;
      built += t.text;
      prefixLen++;
    }
    const keep = placed.slice(0, prefixLen);
    const keepIds = new Set(keep.map((t) => t.id));
    const next = bank.find((t) => !keepIds.has(t.id) && answer.startsWith(normalize(built + t.text)));
    setPlaced(next ? [...keep, next] : keep);
  };
  const check = () => {
    const text = placed.map((t) => t.text).join('');
    const ok = judge ? normalize(text) === answer : true;
    setResult(ok);
    onBuilt?.(text);
    onChecked(ok);
  };

  return (
    <div>
      <div className={`answer-line${result === true && judge ? ' ok' : result === false ? ' bad' : ''}`}>
        {placed.length === 0 && <span className="small muted">Tap the words below</span>}
        {placed.map((t) => (
          <button key={t.id} className="tile" onClick={() => remove(t)}>
            {t.text}
          </button>
        ))}
      </div>
      <div className="tiles">
        {bank.map((t) => (
          <button key={t.id} className="tile" disabled={used.has(t.id) || result !== null} onClick={() => place(t)}>
            {t.text}
            {showPinyin && lexicon[t.text] && (
              <div style={{ fontSize: 11, fontFamily: 'system-ui, sans-serif', color: 'var(--muted)' }}>{lexicon[t.text].py}</div>
            )}
          </button>
        ))}
      </div>
      {result === null && (
        <div className="row" style={{ marginTop: 18 }}>
          <button className="icon-btn" aria-label="Undo" disabled={!placed.length} onClick={() => setPlaced((p) => p.slice(0, -1))}>
            <IconUndo />
          </button>
          {allowHint && (
            <button className="btn sm" onClick={hint}>
              Hint
            </button>
          )}
          <button className="btn primary grow" disabled={!placed.length} onClick={check}>
            {checkLabel}
          </button>
        </div>
      )}
    </div>
  );
}
