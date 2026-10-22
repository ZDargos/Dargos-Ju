import { Fragment } from 'react';

/** Tap between characters to split or join words. Tokens joined must equal the text without spaces. */
export default function SegEditor({ tokens, onChange }: { tokens: string[]; onChange: (tokens: string[]) => void }) {
  const chars = Array.from(tokens.join(''));
  const cuts = new Set<number>();
  let pos = 0;
  for (const t of tokens.slice(0, -1)) {
    pos += Array.from(t).length;
    cuts.add(pos);
  }
  const toggle = (i: number) => {
    const next = new Set(cuts);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    const out: string[] = [];
    let cur = '';
    chars.forEach((c, idx) => {
      if (idx > 0 && next.has(idx)) {
        out.push(cur);
        cur = '';
      }
      cur += c;
    });
    if (cur) out.push(cur);
    onChange(out);
  };
  return (
    <div className="seg-editor" aria-label="Word splits">
      {chars.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <button type="button" className={`seg-cut${cuts.has(i) ? ' on' : ''}`} aria-label={`${cuts.has(i) ? 'Join' : 'Split'} before ${c}`} onClick={() => toggle(i)} />}
          <span className="seg-char">{c}</span>
        </Fragment>
      ))}
    </div>
  );
}
