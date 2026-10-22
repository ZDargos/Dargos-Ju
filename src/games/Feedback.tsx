import type { ReactNode } from 'react';
import { reportSpeechError, speak, ttsAvailable } from '../lib/tts';
import { IconSpeaker } from '../components/Icons';
import type { Sentence } from '../types';

export default function Feedback({ correct, sentence, rate, onNext, children }: { correct: boolean; sentence: Sentence; rate: number; onNext: () => void; children?: ReactNode }) {
  return (
    <>
      <div className={`feedback ${correct ? 'ok' : 'bad'}`}>
        <strong>{correct ? 'Correct!' : 'Not quite.'}</strong>
        {children}
        <div className="zh" style={{ fontSize: 20, marginTop: 6 }}>{sentence.zh}</div>
        <div className="small muted">{sentence.en}</div>
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
