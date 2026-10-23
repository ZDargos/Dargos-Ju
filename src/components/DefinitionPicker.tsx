import { useEffect, useState } from 'react';
import { loadDictionary, loadEnglishDictionary } from '../lib/dictionary';
import { updateSettings, useSettings } from '../lib/store';
import { glossKey, type VocabItem } from '../lib/vocab';
import { shortGloss } from '../lib/vocabGame';
import { langName, useT } from '../i18n';

interface Sense {
  text: string;
  /** The reading it belongs to, when a Chinese word has several. */
  py?: string;
}

/** The dictionary's meanings for a word, one per line. */
async function sensesOf(item: VocabItem): Promise<Sense[]> {
  const out: Sense[] = [];
  if (item.lang === 'zh') {
    const entries = (await loadDictionary())[item.text] ?? [];
    // Each meaning on its own line ("spoon; ladle" offers "spoon" and "ladle"), plus the whole entry.
    for (const e of entries)
      for (const d of e.defs) {
        const py = entries.length > 1 ? e.py : undefined;
        const parts = d.split(/;\s*/).filter(Boolean);
        for (const part of parts) out.push({ text: part, py });
        if (parts.length > 1) out.push({ text: d, py });
      }
  } else {
    for (const z of (await loadEnglishDictionary())[item.text]?.zh ?? []) for (const part of z.split(/[;；,，]\s*/).filter(Boolean)) out.push({ text: part });
  }
  if (!out.length) for (const part of item.gloss.split(/[;；]/)) if (part.trim()) out.push({ text: part.trim() });
  const seen = new Set<string>();
  return out.filter((s) => !seen.has(s.text) && seen.add(s.text)).slice(0, 30);
}

/**
 * "Change definition": pick the meaning a word card (and the word games) should show, or write
 * your own. Saved in settings, so it follows you to every device.
 */
export default function DefinitionPicker({ item, onClose }: { item: VocabItem; onClose: () => void }) {
  const t = useT();
  const settings = useSettings();
  const key = glossKey(item);
  const current = settings.glossOverrides?.[key] ?? null;
  const [senses, setSenses] = useState<Sense[] | null>(null);
  const [own, setOwn] = useState(current && !senses?.some((s) => s.text === current) ? current : '');

  useEffect(() => {
    sensesOf(item).then(setSenses).catch(() => setSenses([]));
  }, [item]);

  const save = (gloss: string | null) => {
    const next = { ...(settings.glossOverrides ?? {}) };
    if (gloss?.trim()) next[key] = gloss.trim();
    else delete next[key];
    updateSettings({ glossOverrides: next });
    onClose();
  };
  const meaningLang = item.lang === 'zh' ? 'en' : 'zh-CN';

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet definition-picker" role="dialog" aria-label={t('Change definition')} onClick={(e) => e.stopPropagation()}>
        <div className="spread">
          <h3 style={{ margin: 0 }}>
            <span className={item.lang === 'zh' ? 'zh' : ''} lang={item.lang === 'zh' ? 'zh-CN' : 'en'}>{item.text}</span>{' '}
            <span className="small muted">{item.py}</span>
          </h3>
          <button className="btn ghost sm" onClick={onClose} aria-label={t('Close')}>✕</button>
        </div>
        <p className="small muted">{t('Pick the meaning to show on this word’s cards and in the word games.')}</p>
        <ul className="list">
          <li>
            <button className={`sense${current === null ? ' on' : ''}`} onClick={() => save(null)}>
              <strong className="small">{t('Default')}</strong>
              <span lang={meaningLang}>{shortGloss(item.gloss)}</span>
            </button>
          </li>
          {senses === null ? (
            <li className="small muted">{t('Loading…')}</li>
          ) : (
            senses.map((s) => (
              <li key={s.text}>
                <button className={`sense${current === s.text ? ' on' : ''}`} onClick={() => save(s.text)}>
                  {s.py && <span className="small muted">{s.py}</span>}
                  <span lang={meaningLang}>{s.text}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <form className="row" style={{ gap: 8, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); save(own); }}>
          <input
            className="input grow"
            lang={meaningLang}
            value={own}
            onChange={(e) => setOwn(e.target.value)}
            placeholder={t('Write your own ({lang})', { lang: langName(item.lang === 'zh' ? 'en' : 'zh') })}
            aria-label={t('Write your own ({lang})', { lang: langName(item.lang === 'zh' ? 'en' : 'zh') })}
            maxLength={80}
          />
          <button className="btn primary" disabled={!own.trim()}>{t('Save')}</button>
        </form>
      </div>
    </div>
  );
}
