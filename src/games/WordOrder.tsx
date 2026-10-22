import { useMemo, useState } from 'react';
import type { GameProps } from './registry';
import { lexiconFor, opsFor, tilesFor } from '../lib/learn';
import { useT } from '../i18n';
import TileBuilder from './TileBuilder';
import Feedback from './Feedback';
import NativePrompt from './NativePrompt';
import { useShowPinyin } from '../components/Pinyin';

export default function WordOrder({ sentence, content, settings, hints, onResult, onNext }: GameProps) {
  const t = useT();
  const target = useMemo(() => tilesFor(sentence, content), [sentence, content]);
  const [result, setResult] = useState<boolean | null>(null);
  const pinyin = useShowPinyin();
  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>{t('Put the words in order:')}</p>
      <NativePrompt sentence={sentence} />
      <TileBuilder
        target={target}
        lexicon={lexiconFor(content, sentence.lang)}
        ops={opsFor(sentence.lang)}
        showPinyin={pinyin}
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
