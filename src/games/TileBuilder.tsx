import { useState } from 'react';
import { makeTiles, type Tile } from './common';
import { lookup, type LangOps } from '../lib/learn';
import { useT } from '../i18n';
import type { LexEntry } from '../types';
import { IconUndo } from '../components/Icons';

interface Props {
  target: string[];
  distractors?: string[];
  lexicon: Record<string, LexEntry>;
  ops: LangOps;
  showPinyin?: boolean;
  allowHint?: boolean;
  /** Called once when the player checks the answer, with the sentence they built. */
  onChecked: (correct: boolean, built: string) => void;
  /** When false, the builder doesn't judge the answer (free building); onChecked gets true. */
  judge?: boolean;
  checkLabel?: string;
  onBuilt?: (text: string) => void;
}

/** Tap word tiles into order. Shared by Word order, Sentence builder and Dictation, in both learning modes. */
export default function TileBuilder({ target, distractors = [], lexicon, ops, showPinyin, allowHint, onChecked, judge = true, checkLabel, onBuilt }: Props) {
  const t = useT();
  // Shuffled once per sentence (the parent remounts this for each new sentence), so the tiles
  // stay put while you pick them and used ones just grey out.
  const [bank] = useState(() => makeTiles([...target, ...distractors]));
  const [placed, setPlaced] = useState<Tile[]>([]);
  const [result, setResult] = useState<null | boolean>(null);
  const used = new Set(placed.map((p) => p.id));
  const answer = ops.normalize(ops.join(target));
  const builtText = (tiles: Tile[]) => ops.join(tiles.map((p) => p.text));

  const place = (tile: Tile) => {
    if (result !== null || used.has(tile.id)) return;
    setPlaced((p) => [...p, tile]);
  };
  const remove = (tile: Tile) => {
    if (result !== null) return;
    setPlaced((p) => p.filter((x) => x.id !== tile.id));
  };
  const hint = () => {
    // Keep the correct prefix, then add the next correct tile.
    let prefixLen = 0;
    while (prefixLen < placed.length && placed[prefixLen].text === target[prefixLen]) prefixLen++;
    const keep = placed.slice(0, prefixLen);
    const keepIds = new Set(keep.map((p) => p.id));
    const next = bank.find((b) => !keepIds.has(b.id) && b.text === target[prefixLen]);
    setPlaced(next ? [...keep, next] : keep);
  };
  const check = () => {
    const text = builtText(placed);
    const ok = judge ? ops.normalize(text) === answer : true;
    setResult(ok);
    onBuilt?.(text);
    onChecked(ok, text);
  };

  return (
    <div>
      <div className={`answer-line${result === true && judge ? ' ok' : result === false ? ' bad' : ''}`} lang={ops.speech}>
        {placed.length === 0 && <span className="small muted">{t('Tap the words below')}</span>}
        {placed.map((p, i) => (
          <button
            key={p.id}
            // After checking, each word shows whether it's in the right spot.
            className={`tile${result !== null && judge ? (result || p.text === target[i] ? ' ok' : ' bad') : ''}`}
            onClick={() => remove(p)}
          >
            {p.text}
          </button>
        ))}
      </div>
      <div className="tiles" lang={ops.speech}>
        {bank.map((b) => {
          const lex = showPinyin ? lookup(lexicon, b.text) : undefined;
          return (
            <button key={b.id} className={`tile${ops.lang === 'en' ? ' en' : ''}`} disabled={used.has(b.id) || result !== null} onClick={() => place(b)}>
              {b.text}
              {lex?.py && <span className="py">{lex.py}</span>}
            </button>
          );
        })}
      </div>
      {result === null && (
        <div className="row" style={{ marginTop: 18 }}>
          <button className="icon-btn" aria-label={t('Undo')} disabled={!placed.length} onClick={() => setPlaced((p) => p.slice(0, -1))}>
            <IconUndo />
          </button>
          {allowHint && (
            <button className="btn sm" onClick={hint}>
              {t('Hint')}
            </button>
          )}
          <button className="btn primary grow" disabled={!placed.length} onClick={check}>
            {checkLabel ?? t('Check')}
          </button>
        </div>
      )}
    </div>
  );
}
