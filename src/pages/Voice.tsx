import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContent } from '../lib/content';
import { getState, useSettings } from '../lib/store';
import { useMyProfile } from '../lib/social';
import { loadVoices, sentencesNeedingVoice, spokenText, submitRecording, useVoices, voiceLeaderboard, voiceProgress, type VoiceLeader } from '../lib/voices';
import { langName, useT } from '../i18n';
import { IconBack } from '../components/Icons';
import NamePrompt from '../components/NamePrompt';
import type { LearnLang } from '../lib/learn';
import type { Sentence } from '../types';

const MAX_MS = 20000;
const LANG_KEY = 'dj:voice-lang';

/** Best format this browser can record that plays everywhere (AAC first, then Opus). */
function recorderMime(): string {
  for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="spread small" style={{ marginBottom: 6 }}>
        <strong>{label}</strong>
        <span className="muted">{done} / {total} · {pct}%</span>
      </div>
      <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** "Lend your voice": native speakers record sentences that other learners then hear. */
export default function Voice() {
  const t = useT();
  const navigate = useNavigate();
  const content = useContent();
  const settings = useSettings();
  useVoices();
  const { profile, reload } = useMyProfile();
  const [lang, setLang] = useState<LearnLang | null>(() => {
    try {
      const v = localStorage.getItem(LANG_KEY);
      return v === 'zh' || v === 'en' ? v : null;
    } catch {
      return null;
    }
  });
  const [confirmed, setConfirmed] = useState(false);
  const [choosing, setChoosing] = useState<LearnLang | null>(null);
  const [leaders, setLeaders] = useState<VoiceLeader[] | null>(null);

  useEffect(() => {
    loadVoices().catch(() => undefined);
    voiceLeaderboard().then(setLeaders).catch(() => setLeaders([]));
  }, []);

  const start = (l: LearnLang) => {
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* remembered for this visit only */
    }
    setLang(l);
    setChoosing(null);
  };

  const zh = voiceProgress(content, 'zh');
  const en = voiceProgress(content, 'en');

  return (
    <>
      <header className="topbar">
        <div className="row">
          <button className="icon-btn" onClick={() => navigate(-1)} aria-label={t('Back')}><IconBack /></button>
          <h1>{t('Lend your voice')}</h1>
        </div>
      </header>

      <div className="card">
        <p style={{ marginTop: 0 }}><strong>{t('Record sentences in a language you speak natively. Other learners will hear your voice and copy it.')}</strong></p>
        <p className="small muted" style={{ marginBottom: 0 }}>
          {t("This is not speaking practice for a language you're learning. Only record if you speak the language like a native, so learners hear it said correctly.")}
        </p>
      </div>

      <div className="card stack">
        <ProgressBar label={t('Chinese sentences with a real voice')} {...zh} />
        <ProgressBar label={t('English sentences with a real voice')} {...en} />
      </div>

      {profile === false && !(import.meta.env.DEV && getState().userId === 'demo') ? (
        <NamePrompt onSaved={reload} />
      ) : !lang || choosing ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('Which language do you speak natively?')}</h3>
          <div className="stack">
            {(['zh', 'en'] as LearnLang[]).map((l) => (
              <button key={l} className={`btn block${choosing === l ? ' primary' : ''}`} aria-pressed={choosing === l} onClick={() => { setChoosing(l); setConfirmed(false); }}>
                {l === 'zh' ? '中文 Chinese' : '英语 English'}
              </button>
            ))}
          </div>
          {choosing && (
            <>
              {choosing === settings.learning && (
                <p className="banner" role="alert" style={{ margin: '12px 0 0' }}>
                  {t("You're learning {lang}. Please don't record it unless you also speak it natively.", { lang: langName(choosing) })}
                </p>
              )}
              <label className="row" style={{ marginTop: 12, gap: 10, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 4 }} />
                <span>{t('I speak {lang} natively or like a native speaker.', { lang: langName(choosing) })}</span>
              </label>
              <button className="btn primary block" style={{ marginTop: 12 }} disabled={!confirmed} onClick={() => start(choosing)}>
                {t('Start recording')}
              </button>
            </>
          )}
        </div>
      ) : (
        <Recorder lang={lang} onChangeLang={() => setChoosing(lang)} onSubmitted={() => voiceLeaderboard().then(setLeaders).catch(() => undefined)} />
      )}

      <div className="section-title">{t('Top voices')}</div>
      <div className="card">
        {leaders === null ? (
          <div className="small muted">{t('Loading…')}</div>
        ) : leaders.length === 0 ? (
          <div className="small muted">{t('No recordings yet. Yours could be the first!')}</div>
        ) : (
          <ol className="list leaderboard">
            {leaders.slice(0, 20).map((l, i) => (
              <li key={l.user_id} className="spread">
                <span><span className="muted">{i + 1}.</span> {l.display_name}</span>
                <span className="small muted">{t('{n} recordings', { n: l.recordings })}{l.zh && l.en ? ` (${langName('zh')} ${l.zh} · ${langName('en')} ${l.en})` : ''}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

type Phase = 'idle' | 'recording' | 'recorded' | 'saving';

function Recorder({ lang, onChangeLang, onSubmitted }: { lang: LearnLang; onChangeLang: () => void; onSubmitted: () => void }) {
  const t = useT();
  const content = useContent();
  const voices = useVoices();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<Sentence | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [mine, setMine] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval>>(undefined);
  const previewUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : ''), [blob]);

  const pool = useMemo(() => sentencesNeedingVoice(content, lang), [content, lang, voices]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = (avoid: Set<string> = skipped) => {
    const fresh = pool.filter((s) => !avoid.has(s.id) && s.id !== current?.id);
    const choices = fresh.length ? fresh : pool.filter((s) => s.id !== current?.id);
    setCurrent(choices.length ? choices[Math.floor(Math.random() * choices.length)] : null);
    setBlob(null);
    setPhase('idle');
    setError('');
  };

  useEffect(() => {
    if (!current || !pool.some((s) => s.id === current.id)) next();
  }, [lang, pool.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    clearInterval(tick.current);
    recorder.current?.stream.getTracks().forEach((tr) => tr.stop());
  }, []);

  const startRecording = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      const mime = recorderMime();
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        clearInterval(tick.current);
        const ms = Date.now() - startedAt.current;
        if (ms < 600) {
          setPhase('idle');
          setError(t('That was too short. Tap Record, read the whole sentence, then tap Stop.'));
          return;
        }
        setDuration(ms);
        setBlob(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }));
        setPhase('recorded');
      };
      recorder.current = rec;
      startedAt.current = Date.now();
      setElapsed(0);
      rec.start();
      setPhase('recording');
      tick.current = setInterval(() => {
        const ms = Date.now() - startedAt.current;
        setElapsed(ms);
        if (ms >= MAX_MS && rec.state === 'recording') rec.stop();
      }, 200);
    } catch (e) {
      const name = (e as Error).name;
      setError(name === 'NotAllowedError' ? t('Microphone access was blocked. Allow it in your browser or phone settings, then try again.') : t('Could not start the microphone: {error}', { error: (e as Error).message }));
    }
  };

  const stopRecording = () => recorder.current?.state === 'recording' && recorder.current.stop();

  const submit = async () => {
    if (!blob || !current) return;
    setPhase('saving');
    setError('');
    try {
      await submitRecording(current, lang, blob, duration);
      setMine((n) => n + 1);
      onSubmitted();
      next();
    } catch (e) {
      const m = (e as Error).message;
      if (/ALREADY_RECORDED/.test(m)) {
        setError(t('Someone just recorded that sentence. Here is another one.'));
        next();
      } else {
        setPhase('recorded');
        setError(/DAILY_LIMIT/.test(m) ? t("You've reached today's recording limit. Thank you! Come back tomorrow.") : t('Could not save the recording: {error}', { error: m }));
      }
    }
  };

  const skip = () => {
    if (!current) return;
    const s = new Set(skipped).add(current.id);
    setSkipped(s);
    next(s);
  };

  const other: LearnLang = lang === 'zh' ? 'en' : 'zh';

  return (
    <div className="card">
      <div className="spread small" style={{ marginBottom: 10 }}>
        <span className="muted">{t('Recording in {lang}', { lang: langName(lang) })}{mine > 0 && ` · ${t('{n} recorded this visit', { n: mine })}`}</span>
        <button className="btn ghost sm" onClick={onChangeLang}>{t('Change')}</button>
      </div>
      {!current ? (
        <p className="center">{t('Every {lang} sentence has a real voice now. Thank you!', { lang: langName(lang) })}</p>
      ) : (
        <>
          <div className={`record-sentence${lang === 'zh' ? ' zh' : ''}`} lang={lang === 'zh' ? 'zh-CN' : 'en'}>
            {spokenText(current, lang).split(/(?=\b[A-Z]\s*[:：])/).map((line, i) => <div key={i}>{line.trim()}</div>)}
          </div>
          <div className="small muted center" lang={other === 'zh' ? 'zh-CN' : 'en'} style={{ marginBottom: 14 }}>{spokenText(current, other)}</div>
          <p className="small muted center" style={{ marginTop: 0 }}>{t('Read it at a natural pace in a quiet place. For a dialogue, read both parts.')}</p>

          {phase === 'idle' && (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn grow" onClick={skip}>{t('Skip')}</button>
              <button className="btn primary grow" onClick={startRecording}>● {t('Record')}</button>
            </div>
          )}
          {phase === 'recording' && (
            <button className="btn accent block recording" onClick={stopRecording} aria-live="polite">
              ■ {t('Stop')} · {(elapsed / 1000).toFixed(1)}s
            </button>
          )}
          {(phase === 'recorded' || phase === 'saving') && (
            <>
              <audio src={previewUrl} controls style={{ width: '100%', marginBottom: 10 }} aria-label={t('Your recording')} />
              <div className="row" style={{ gap: 8 }}>
                <button className="btn grow" disabled={phase === 'saving'} onClick={() => { setBlob(null); setPhase('idle'); }}>{t('Record again')}</button>
                <button className="btn primary grow" disabled={phase === 'saving'} onClick={submit}>{phase === 'saving' ? t('Saving…') : t('Submit')}</button>
              </div>
            </>
          )}
        </>
      )}
      {error && <div className="error" role="alert">{error}</div>}
    </div>
  );
}
