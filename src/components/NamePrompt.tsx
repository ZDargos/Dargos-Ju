import { useState } from 'react';
import { saveDisplayName } from '../lib/social';

/** Asks for the display name other players will see. */
export default function NamePrompt({ onSaved, initial = '' }: { onSaved: () => void; initial?: string }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await saveDisplayName(name);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{initial ? 'Change your name' : 'Pick a display name'}</h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        This is the only thing other players see. Your email stays private.
      </p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <input className="input grow" maxLength={24} placeholder="e.g. Dargos" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={busy || name.trim().length < 2}>Save</button>
      </form>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
