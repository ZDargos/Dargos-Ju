import { useEffect, useRef, useState } from 'react';
import { contributorName, useVoices, voteRecording, type VoiceRecording } from '../lib/voices';
import { useStore } from '../lib/store';
import { useT } from '../i18n';

/**
 * After a person's recording plays anywhere in the app, asks the listener whether it sounds right.
 * Shown once per recording (not for your own); enough "bad" votes remove the recording.
 */
export default function RecordingVote() {
  const t = useT();
  const me = useStore((s) => s.userId);
  const { voted } = useVoices();
  const [rec, setRec] = useState<VoiceRecording | null>(null);
  const [name, setName] = useState('');
  const [done, setDone] = useState<'' | 'thanks' | 'removed'>('');
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const on = (e: Event) => {
      const r = (e as CustomEvent<VoiceRecording>).detail;
      if (!r || r.user_id === me || voted.has(r.id)) return;
      setRec(r);
      setDone('');
      setError('');
      setName('');
      contributorName(r.user_id).then(setName);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setRec(null), 15000);
    };
    window.addEventListener('dj:played-recording', on);
    return () => window.removeEventListener('dj:played-recording', on);
  }, [me, voted]);

  if (!rec) return null;

  const vote = async (good: boolean) => {
    clearTimeout(timer.current);
    try {
      const removed = await voteRecording(rec, good);
      setDone(removed ? 'removed' : 'thanks');
      timer.current = setTimeout(() => setRec(null), 2500);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="banner vote-banner" role="region" aria-label={t('Rate this recording')}>
      {done ? (
        <div role="status">{done === 'removed' ? t('Thanks. That recording has been removed and will be recorded again.') : t('Thanks for voting!')}</div>
      ) : (
        <>
          <div className="spread">
            <span>{name ? t('{name} recorded this. Does it sound right?', { name }) : t('A learner recorded this. Does it sound right?')}</span>
            <button className="btn ghost sm" onClick={() => setRec(null)} aria-label={t('Dismiss')}>✕</button>
          </div>
          <div className="row" style={{ marginTop: 8, gap: 8 }}>
            <button className="btn sm grow" onClick={() => vote(true)}>👍 {t('Good')}</button>
            <button className="btn sm grow" onClick={() => vote(false)}>👎 {t('Bad')}</button>
          </div>
          {error && <div className="error">{error}</div>}
        </>
      )}
    </div>
  );
}
