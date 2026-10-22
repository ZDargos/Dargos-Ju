import { createContext, useContext } from 'react';
import { isHanWord } from '../lib/segmenter';
import { updateSettings, useSettings } from '../lib/store';
import type { LexEntry } from '../types';

/** Pinyin on/off for the screen below; game screens provide it so games don't need a prop. */
export const PinyinContext = createContext(false);
export const useShowPinyin = () => useContext(PinyinContext);

/** Whether pinyin is switched on for a section (study, a game, stats). Off by default. */
export function usePinyin(section: string): boolean {
  return useSettings().pinyin?.[section] ?? false;
}

/** Small round button in the bottom-left corner that switches pinyin on or off for a section. */
export function PinyinToggle({ section, aboveTabBar = false }: { section: string; aboveTabBar?: boolean }) {
  const settings = useSettings();
  const on = settings.pinyin?.[section] ?? false;
  return (
    <button
      className={`pinyin-fab${on ? ' on' : ''}${aboveTabBar ? ' above-tabs' : ''}`}
      aria-pressed={on}
      aria-label={on ? 'Hide pinyin' : 'Show pinyin'}
      title={on ? 'Hide pinyin' : 'Show pinyin'}
      onClick={() => updateSettings({ pinyin: { ...settings.pinyin, [section]: !on } })}
    >
      <span className="zh">拼</span>
      <span className="pinyin-fab-label">{on ? 'on' : 'off'}</span>
    </button>
  );
}

/** Chinese text with pinyin over each word when `show` is on; plain text otherwise. */
export function PinyinText({ tokens, text, lexicon, show, className, style }: {
  tokens: string[];
  text?: string;
  lexicon: Record<string, LexEntry>;
  show: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!show) return <span className={`zh ${className ?? ''}`} style={style}>{text ?? tokens.join('')}</span>;
  return (
    <span className={`zh pinyin-text ${className ?? ''}`} style={style}>
      {tokens.map((t, i) =>
        isHanWord(t) ? (
          <span key={i} className="pinyin-word">
            <span className="py">{lexicon[t]?.py ?? ' '}</span>
            <span>{t}</span>
          </span>
        ) : (
          <span key={i} className="pinyin-word">
            <span className="py">{' '}</span>
            <span>{t}</span>
          </span>
        ),
      )}
    </span>
  );
}
