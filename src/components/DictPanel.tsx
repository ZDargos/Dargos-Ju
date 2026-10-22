import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadDictionary } from '../lib/dictionary';
import { useContent } from '../lib/content';
import { speak, reportSpeechError, ttsAvailable } from '../lib/tts';
import { useSettings } from '../lib/store';
import type { FullEntry } from '../lib/segmenter';
import { IconBack, IconClose, IconSpeaker } from './Icons';

/** Bottom sheet with every reading and meaning of a word, plus its single characters. */
export default function DictPanel({ word, onClose }: { word: string; onClose: () => void }) {
  const { lexicon } = useContent();
  const settings = useSettings();
  const [stack, setStack] = useState([word]);
  const [dict, setDict] = useState<Record<string, FullEntry[]> | null>(null);
  const current = stack[stack.length - 1];

  useEffect(() => {
    loadDictionary().then(setDict).catch(() => setDict({}));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const entries: FullEntry[] = dict?.[current] ?? (lexicon[current] ? [{ py: lexicon[current].py, defs: lexicon[current].en.split('; ') }] : []);
  const chars = Array.from(current);

  // Portal to <body> so the sheet doesn't inherit the surrounding card's layout and alignment.
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={`Dictionary: ${current}`} onClick={(e) => e.stopPropagation()}>
        <div className="spread">
          <div className="row">
            {stack.length > 1 && (
              <button className="icon-btn" aria-label="Back" onClick={() => setStack((s) => s.slice(0, -1))}><IconBack /></button>
            )}
            <span className="zh" style={{ fontSize: 40, lineHeight: 1.1 }}>{current}</span>
            {ttsAvailable() && (
              <button className="icon-btn" aria-label="Listen" onClick={() => speak(current, settings.speechRate).catch(reportSpeechError)}><IconSpeaker /></button>
            )}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>

        {!dict ? (
          <p className="muted">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="muted">No dictionary entry for this word.</p>
        ) : (
          entries.map((e, i) => (
            <div key={i} style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{e.py}</div>
              <ol style={{ margin: '6px 0 0', paddingLeft: 22 }}>
                {e.defs.map((d, j) => (
                  <li key={j} style={{ marginTop: 2 }}>{d}</li>
                ))}
              </ol>
            </div>
          ))
        )}

        {chars.length > 1 && (
          <>
            <div className="section-title">Characters</div>
            <ul className="list card" style={{ paddingTop: 2, paddingBottom: 2 }}>
              {chars.map((c, i) => {
                const first = dict?.[c]?.[0] ?? (lexicon[c] ? { py: lexicon[c].py, defs: [lexicon[c].en] } : null);
                return (
                  <li key={i} className="term-row" style={{ cursor: 'pointer' }} onClick={() => setStack((s) => [...s, c])}>
                    <span className="term">{c}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="small"><strong>{first?.py ?? ''}</strong></div>
                      <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first?.defs.slice(0, 3).join('; ') ?? ''}</div>
                    </div>
                    <span className="muted">›</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <p className="small muted" style={{ marginBottom: 0 }}>From CC-CEDICT.</p>
      </div>
    </div>,
    document.body,
  );
}
