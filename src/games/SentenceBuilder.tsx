import { useMemo, useState } from 'react';
import type { GameProps } from './registry';
import { pick } from './common';
import { shuffle } from '../lib/srs';
import { lexiconFor, opsFor, tilesFor, type LearnSentence } from '../lib/learn';
import type { Content } from '../lib/content';
import { reportSpeechError, speak, ttsAvailable } from '../lib/tts';
import { useT } from '../i18n';
import { IconSpeaker } from '../components/Icons';
import TileBuilder from './TileBuilder';
import Feedback from './Feedback';
import NativePrompt from './NativePrompt';
import { useShowPinyin } from '../components/Pinyin';
import { msg } from '../i18n/msg';

type Mode = 'translate' | 'free';

/** Extra word tiles from other sentences, preferring words of similar length so they're plausible. */
function distractorsFor(sentence: LearnSentence, pool: LearnSentence[], content: Content, n: number): string[] {
  const ops = opsFor(sentence.lang);
  const own = new Set(tilesFor(sentence, content));
  const words = [...new Set(pool.flatMap((s) => tilesFor(s, content).filter(ops.isWord)))].filter((w) => !own.has(w));
  const lengths = new Set([...own].map((w) => w.length));
  const similar = words.filter((w) => lengths.has(w.length));
  return shuffle(similar.length >= n ? similar : words).slice(0, n);
}

export default function SentenceBuilder(props: GameProps) {
  const t = useT();
  const [mode, setMode] = useState<Mode>('translate');
  if (props.vs) return <Translate key={props.sentence.id} {...props} />;
  return (
    <>
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={mode === 'translate' ? 'on' : ''} onClick={() => setMode('translate')}>{t('Translate')}</button>
        <button className={mode === 'free' ? 'on' : ''} onClick={() => setMode('free')}>{t('Free build')}</button>
      </div>
      {mode === 'translate' ? <Translate key={props.sentence.id} {...props} /> : <Free key={props.sentence.id} {...props} />}
    </>
  );
}

function Translate({ sentence, pool, content, settings, hints, onResult, onNext }: GameProps) {
  const t = useT();
  const target = useMemo(() => tilesFor(sentence, content), [sentence, content]);
  const [extras] = useState(() => distractorsFor(sentence, pool, content, Math.min(5, Math.max(3, Math.round(tilesFor(sentence, content).length / 2)))));
  const [result, setResult] = useState<boolean | null>(null);
  const pinyin = useShowPinyin();
  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>{t("Translate using the word bank. Some words don't belong.")}</p>
      <NativePrompt sentence={sentence} />
      <TileBuilder
        target={target}
        distractors={extras}
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

const FREE_PROMPTS = [msg('Make a question.'), msg('Make a statement.'), msg('Make a negative sentence.'), msg('Use as many words as you can.'), msg('Talk about yourself.')];

function Free({ sentence, pool, content, settings, onResult, onNext }: GameProps) {
  const t = useT();
  const ops = opsFor(sentence.lang);
  // A word bank drawn from this sentence and two others; build anything that makes sense.
  // Random picks are made once per round so re-renders never reshuffle them.
  const [sources] = useState(() => [sentence, ...shuffle(pool.filter((s) => s.id !== sentence.id)).slice(0, 2)]);
  const [bank] = useState(() => {
    const words = [...new Set(sources.flatMap((s) => tilesFor(s, content).filter(ops.isWord)))];
    return shuffle(words).slice(0, 12);
  });
  const [built, setBuilt] = useState<string | null>(null);
  const pinyin = useShowPinyin();
  const [graded, setGraded] = useState(false);
  const lowerBank = new Set(bank.map((w) => w.toLowerCase()));
  const examples = sources.filter((s) => s.tokens.some((tok) => lowerBank.has(tok.toLowerCase())));
  const [prompt] = useState(() => pick(FREE_PROMPTS));
  const targetLang = sentence.lang === 'zh' ? 'zh-CN' : 'en';

  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>
        {t('Build your own sentence from these words, then check it yourself.')} <strong>{t(prompt)}</strong>
      </p>
      <TileBuilder target={bank} lexicon={lexiconFor(content, sentence.lang)} ops={ops} showPinyin={pinyin} judge={false} checkLabel={t('Done')} onChecked={() => undefined} onBuilt={setBuilt} />
      {built !== null && (
        <>
          <div className="card" style={{ marginTop: 14 }}>
            <div className="small muted">{t('Your sentence')}</div>
            <div className={sentence.lang === 'zh' ? 'zh' : ''} style={{ fontSize: 22 }} lang={targetLang}>{built}</div>
            {ttsAvailable() && (
              <button className="btn ghost sm" style={{ paddingLeft: 0 }} onClick={() => speak(built, settings.speechRate, sentence.lang).catch(reportSpeechError)}>
                <IconSpeaker /> {t('Hear it')}
              </button>
            )}
            <div className="small muted" style={{ marginTop: 10 }}>{t('Sentences that use these words:')}</div>
            {examples.map((s) => (
              <div key={s.id} style={{ marginTop: 6 }}>
                <div className={sentence.lang === 'zh' ? 'zh' : ''} lang={targetLang}>{s.target}</div>
                <div className="small muted">{s.native}</div>
              </div>
            ))}
          </div>
          {!graded ? (
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn grow" onClick={() => { setGraded(true); onResult(false); }}>{t("Not sure it's right")}</button>
              <button className="btn primary grow" onClick={() => { setGraded(true); onResult(true); }}>{t('Makes sense')}</button>
            </div>
          ) : (
            <button className="btn primary block" style={{ marginTop: 12 }} onClick={onNext}>{t('Next')}</button>
          )}
        </>
      )}
    </>
  );
}
