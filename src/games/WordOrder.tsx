import { useMemo, useState } from 'react';
import type { GameProps } from './registry';
import { tilesOf } from './common';
import TileBuilder from './TileBuilder';
import Feedback from './Feedback';
import { useShowPinyin } from '../components/Pinyin';

export default function WordOrder({ sentence, content, settings, hints, onResult, onNext }: GameProps) {
  const target = useMemo(() => tilesOf(sentence), [sentence]);
  const [result, setResult] = useState<boolean | null>(null);
  const pinyin = useShowPinyin();
  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>Put the words in order:</p>
      <div className="card center" style={{ marginBottom: 16, fontSize: 19, fontWeight: 500 }}>{sentence.en}</div>
      <TileBuilder
        target={target}
        lexicon={content.lexicon}
        showPinyin={hints || pinyin}
        allowHint={hints}
        onChecked={(ok, built) => {
          setResult(ok);
          onResult(ok, built);
        }}
      />
      {result !== null && <Feedback correct={result} sentence={sentence} rate={settings.speechRate} onNext={onNext} />}
    </>
  );
}
