import { createContext, useContext } from 'react';
import { updateSettings, useSettings } from '../lib/store';
import { lookup, opsFor, type LearnLang } from '../lib/learn';
import { useT } from '../i18n';
import type { LexEntry } from '../types';

// "Pinyin" here means pronunciation shown over the language being learned: pinyin over Chinese,
// or phonetics (音标) over English in English-learning mode.

/** Pronunciation on/off for the screen below; game screens provide it so games don't need a prop. */
export const PinyinContext = createContext(false);
export const useShowPinyin = () => useContext(PinyinContext);

/** Whether pronunciation is switched on for a section (study, a game, stats). Off by default. */
export function usePinyin(section: string): boolean {
  const s = useSettings();
  return s.pinyin?.[pinyinKey(section, s.learning)] ?? false;
}

/** Each mode remembers its own switch per section (pinyin in Chinese mode, phonetics in English mode). */
const pinyinKey = (section: string, learning: LearnLang) => (learning === 'en' ? `en:${section}` : section);

/** Small round button in the bottom-left corner that switches pronunciation on or off for a section. */
export function PinyinToggle({ section, aboveTabBar = false }: { section: string; aboveTabBar?: boolean }) {
  const t = useT();
  const settings = useSettings();
  const key = pinyinKey(section, settings.learning);
  const on = settings.pinyin?.[key] ?? false;
  const english = settings.learning === 'en';
  const what = english ? t('phonetics') : t('pinyin');
  return (
    <button
      className={`pinyin-fab${on ? ' on' : ''}${aboveTabBar ? ' above-tabs' : ''}`}
      aria-pressed={on}
      aria-label={on ? t('Hide {what}', { what }) : t('Show {what}', { what })}
      title={on ? t('Hide {what}', { what }) : t('Show {what}', { what })}
      onClick={() => updateSettings({ pinyin: { ...settings.pinyin, [key]: !on } })}
    >
      <span className="zh">{english ? '音' : '拼'}</span>
      <span className="pinyin-fab-label">{on ? t('on') : t('off')}</span>
    </button>
  );
}

/** Text in the language being learned, with pronunciation over each word when `show` is on. */
export function PinyinText({ tokens, text, lexicon, show, lang = 'zh', className, style }: {
  tokens: string[];
  text?: string;
  lexicon: Record<string, LexEntry>;
  show: boolean;
  lang?: LearnLang;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ops = opsFor(lang);
  const plain = text ?? ops.join(tokens);
  if (!show)
    return (
      <span className={`${lang === 'zh' ? 'zh ' : ''}${className ?? ''}`} style={style} lang={ops.speech}>
        {plain}
      </span>
    );
  return (
    <span className={`${lang === 'zh' ? 'zh ' : 'en-words '}pinyin-text ${className ?? ''}`} style={style} lang={ops.speech}>
      {tokens.map((tok, i) => (
        <span key={i} className={`pinyin-word${lang === 'en' && /^[,.!?;:%)]$/.test(tok) ? ' punct' : ''}`}>
          <span className="py">{(ops.isWord(tok) && lookup(lexicon, tok)?.py) || ' '}</span>
          <span>{tok}</span>
        </span>
      ))}
    </span>
  );
}
