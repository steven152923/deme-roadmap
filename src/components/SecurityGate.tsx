import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type SecurityMode = 'checking' | 'setup' | 'locked' | 'unlocked';

export function SecurityGate({ mode, busy, error, onSetup, onUnlock }: {
  mode: Exclude<SecurityMode, 'unlocked'>;
  busy: boolean;
  error: string;
  onSetup: (passcode: string) => Promise<void>;
  onUnlock: (passcode: string) => Promise<void>;
}) {
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPasscode('');
    setConfirm('');
    setLocalError('');
    if (mode !== 'checking') window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [mode]);

  function clean(value: string) { return value.replace(/\D/g, '').slice(0, 12); }

  async function submit() {
    if (busy || mode === 'checking') return;
    if (!/^\d{4,12}$/.test(passcode)) { setLocalError('Use a 4–12 digit passcode.'); return; }
    if (mode === 'setup') {
      if (passcode !== confirm) { setLocalError('Those passcodes do not match.'); return; }
      setLocalError('');
      await onSetup(passcode);
      return;
    }
    setLocalError('');
    await onUnlock(passcode);
  }

  return (
    <div className="security-screen ops-security-screen">
      <div className="security-card ops-security-card">
        <div className="security-brand">
          <div className="security-mark"><span>D</span></div>
          <div><strong>Deme Ops</strong><small>private operations workspace</small></div>
        </div>

        {mode === 'checking' ? (
          <div className="security-loading"><div className="security-loader" /><h1>Opening Deme Ops</h1><p>Checking the local lock before private operational data is loaded.</p></div>
        ) : mode === 'setup' ? (
          <>
            <div className="security-icon"><ShieldCheck size={29} /></div>
            <span className="security-kicker">First-time security setup</span>
            <h1>Protect Deme Ops</h1>
            <p>This passcode stays on this PC and survives app updates. It is separate from companion-device authentication.</p>
            <label className="security-field"><span>Create passcode</span><input ref={inputRef} type="password" inputMode="numeric" autoComplete="new-password" value={passcode} onChange={(event) => setPasscode(clean(event.target.value))} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="4–12 digits" /></label>
            <label className="security-field"><span>Confirm passcode</span><input type="password" inputMode="numeric" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(clean(event.target.value))} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="Again" /></label>
            {(localError || error) && <div className="security-error">{localError || error}</div>}
            <button className="security-primary" type="button" disabled={busy} onClick={submit}><LockKeyhole size={17} /> {busy ? 'Securing…' : 'Set passcode & enter'}</button>
            <div className="security-footnote">Stored as a salted verifier, never readable plaintext.</div>
          </>
        ) : (
          <>
            <div className="security-icon"><LockKeyhole size={29} /></div>
            <span className="security-kicker">Deme Ops is locked</span>
            <h1>Welcome back</h1>
            <p>Work, QA, signals, connected systems and operational notes stay hidden until you unlock them.</p>
            <label className="security-field"><span>Passcode</span><input ref={inputRef} type="password" inputMode="numeric" autoComplete="current-password" value={passcode} onChange={(event) => setPasscode(clean(event.target.value))} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="Enter passcode" /></label>
            {(localError || error) && <div className="security-error">{localError || error}</div>}
            <button className="security-primary" type="button" disabled={busy} onClick={submit}><LockKeyhole size={17} /> {busy ? 'Checking…' : 'Unlock Deme Ops'}</button>
            <div className="security-footnote">Fully closing the app locks it again automatically.</div>
          </>
        )}
      </div>
    </div>
  );
}
