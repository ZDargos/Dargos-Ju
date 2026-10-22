import type { ReactNode } from 'react';
import { reportSpeechError, speak, ttsAvailable } from '../lib/tts';
import { IconSpeaker } from '../components/Icons';
import type { Sentence } from '../types';
import { useContent } from '../lib/content';
import WordBreakdown from '../components/WordBreakdown';
import { PinyinText, useShowPinyin } from '../components/Pinyin';

export default function Feedback({ correct, sentence, rate, onNext, children }: { correct: boolean; sentence: Sentence; rate: number; onNext: () => void; children?: ReactNode }) {
  const { lexicon } = useContent();
  const pinyin = useShowPinyin();
  return (
    <>
      <div className={`feedback ${correct ? 'ok' : 'bad'}`}>
        <strong>{correct ? 'Correct!' : 'Not quite.'}</strong>
        {children}
        <div style={{ fontSize: 20, marginTop: 6 }}>
          <PinyinText tokens={sentence.tokens} text={sentence.zh} lexicon={lexicon} show={pinyin} style={{ justifyContent: 'flex-start' }} />
        </div>
        <div className="small muted">{sentence.en}</div>
        <WordBreakdown sentence={sentence} lexicon={lexicon} align="start" />
        {ttsAvailable() && (
          <button className="btn ghost sm" style={{ marginTop: 6, paddingLeft: 0 }} onClick={() => speak(sentence.zh, rate).catch(reportSpeechError)}>
            <IconSpeaker /> Listen
          </button>
        )}
      </div>
      <button className="btn primary block" style={{ marginTop: 12 }} onClick={onNext} autoFocus>
        Next
      </button>
    </>
  );
}
