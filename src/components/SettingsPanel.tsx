import { Download, FolderOpen, LockKeyhole, Palette, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { APP_VERSION } from '../appVersion';
import type { RoadmapSettings, SecurityActionResult, ThemePreset } from '../types';

const THEMES: { id: ThemePreset; name: string; description: string }[] = [
  { id: 'candy', name: 'Command Light', description: 'Clean neutral surfaces with a restrained Deme violet accent.' },
  { id: 'night', name: 'Night Shift', description: 'Dark operational workspace built for long sessions.' },
  { id: 'paper', name: 'Warm Console', description: 'A warmer low-contrast workspace without decorative clutter.' },
];

export function SettingsPanel({ settings, dataPath, autoLockMinutes, onChange, onBackup, onRestore, onRevealData, onAutoLockChange, onChangePasscode }: {
  settings: RoadmapSettings;
  dataPath: string;
  autoLockMinutes: number;
  onChange: (patch: Partial<RoadmapSettings>) => void;
  onBackup: () => void;
  onRestore: () => void;
  onRevealData: () => void;
  onAutoLockChange: (minutes: number) => Promise<SecurityActionResult>;
  onChangePasscode: (currentPasscode: string, nextPasscode: string) => Promise<SecurityActionResult>;
}) {
  const [newArea, setNewArea] = useState('');
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [nextPasscode, setNextPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [securityBusy, setSecurityBusy] = useState(false);

  function addArea() {
    const value = newArea.trim();
    if (!value || settings.areas.some((area) => area.toLowerCase() === value.toLowerCase())) return;
    onChange({ areas: [...settings.areas, value] });
    setNewArea('');
  }

  async function changePasscode() {
    if (!/^\d{4,12}$/.test(nextPasscode)) { setSecurityMessage('New passcode must be 4–12 digits.'); return; }
    if (nextPasscode !== confirmPasscode) { setSecurityMessage('New passcodes do not match.'); return; }
    setSecurityBusy(true);
    const result = await onChangePasscode(currentPasscode, nextPasscode);
    setSecurityBusy(false);
    if (!result.ok) { setSecurityMessage(result.error || 'Passcode could not be changed.'); return; }
    setCurrentPasscode(''); setNextPasscode(''); setConfirmPasscode(''); setSecurityMessage('Passcode updated ✓');
  }

  return (
    <div className="settings-page v5-settings ops-settings">
      <section className="settings-section style-studio-section">
        <div className="settings-heading"><span className="eyebrow">Appearance</span><h3>Choose the Ops workspace tone</h3><p>Same information architecture, different contrast. No decorative cloud layer or alternate navigation system.</p></div>
        <div className="theme-choice-grid">{THEMES.map((theme) => <button type="button" key={theme.id} className={`theme-choice theme-${theme.id} ${settings.themePreset === theme.id ? 'active' : ''}`} onClick={() => onChange({ themePreset: theme.id })}><div className="theme-preview"><i /><i /><i /><span /></div><div><strong>{theme.name}</strong><small>{theme.description}</small></div>{settings.themePreset === theme.id && <span className="theme-selected">Using</span>}</button>)}</div>
      </section>

      <section className="settings-section">
        <div className="settings-heading"><span className="eyebrow">Workspace defaults</span><h3>How Work behaves</h3><p>Deme Ops always opens on Overview. These options control the delivery tools inside Work.</p></div>
        <label className="settings-row"><span><strong>Compact delivery cards</strong><small>Fit more work into each release-board lane.</small></span><input type="checkbox" checked={settings.compactCards} onChange={(event) => onChange({ compactCards: event.target.checked })} /></label>
        <label className="settings-row"><span><strong>Show Completed lane</strong><small>Keep shipped work visible on the delivery board.</small></span><input type="checkbox" checked={settings.showShippedOnBoard} onChange={(event) => onChange({ showShippedOnBoard: event.target.checked })} /></label>
        <label className="settings-row"><span><strong>Confirm permanent deletion</strong><small>Ask before a work item disappears forever.</small></span><input type="checkbox" checked={settings.confirmPermanentDelete} onChange={(event) => onChange({ confirmPermanentDelete: event.target.checked })} /></label>
        <label className="settings-row"><span><strong>Due-soon window</strong><small>How many days Ops treats as approaching a target.</small></span><div className="number-setting"><input type="number" min={1} max={30} value={settings.dueSoonDays} onChange={(event) => onChange({ dueSoonDays: Math.min(30, Math.max(1, Number(event.target.value) || 1)) })} /><span>days</span></div></label>
      </section>

      <section className="settings-section security-settings-section">
        <div className="settings-heading"><span className="eyebrow">Security</span><h3><ShieldCheck size={19} /> Local access lock</h3><p>The desktop passcode remains separate from companion pairing. Companion access is blocked whenever Deme Ops is locked.</p></div>
        <label className="settings-row"><span><strong>Lock after inactivity</strong><small>Manual lock and Ctrl+L always work. Fully closing Ops always locks the next launch.</small></span><select value={autoLockMinutes} onChange={async (event) => { const minutes = Number(event.target.value); const result = await onAutoLockChange(minutes); setSecurityMessage(result.ok ? 'Auto-lock updated ✓' : result.error || 'Could not update auto-lock.'); }}><option value={0}>Off</option><option value={5}>5 minutes</option><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option></select></label>
        <div className="passcode-change-card"><div className="passcode-change-title"><LockKeyhole size={17} /><span><strong>Change passcode</strong><small>You need the current passcode first.</small></span></div><div className="passcode-change-fields"><input type="password" inputMode="numeric" value={currentPasscode} onChange={(event) => setCurrentPasscode(event.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Current" /><input type="password" inputMode="numeric" value={nextPasscode} onChange={(event) => setNextPasscode(event.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="New 4–12 digits" /><input type="password" inputMode="numeric" value={confirmPasscode} onChange={(event) => setConfirmPasscode(event.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Confirm new" /><button type="button" disabled={securityBusy || !currentPasscode || !nextPasscode || !confirmPasscode} onClick={changePasscode}>{securityBusy ? 'Changing…' : 'Change'}</button></div>{securityMessage && <div className="security-settings-message">{securityMessage}</div>}<small className="passcode-warning">There is deliberately no way to reveal the stored passcode.</small></div>
      </section>

      <section className="settings-section">
        <div className="settings-heading"><span className="eyebrow">Product areas</span><h3>How Deme work is grouped</h3><p>Areas are shared by work capture, filters and delivery planning.</p></div>
        <div className="area-settings-list">{settings.areas.map((area) => <span key={area}>{area}<button type="button" disabled={settings.areas.length <= 1} onClick={() => onChange({ areas: settings.areas.filter((item) => item !== area) })}><Trash2 size={12} /></button></span>)}</div>
        <div className="inline-add settings-inline-add"><input value={newArea} onChange={(event) => setNewArea(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), addArea())} placeholder="New area" /><button type="button" onClick={addArea}><Plus size={15} /> Add area</button></div>
      </section>

      <section className="settings-section">
        <div className="settings-heading"><span className="eyebrow">Local data</span><h3>Deme Ops remains local-first</h3><p>The existing roadmap data, passcode verifier, paired devices, signals and attachments survive this rebrand and installer update.</p></div>
        <div className="data-location"><div><strong>Canonical work data</strong><code>{dataPath || 'Loading local path…'}</code></div><button type="button" onClick={onRevealData}><FolderOpen size={15} /> Show in folder</button></div>
        <div className="settings-data-actions"><button type="button" onClick={onBackup}><Download size={16} /> Back up work data</button><button type="button" onClick={onRestore}><Upload size={16} /> Restore backup</button></div>
      </section>

      <section className="about-card"><div className="about-mark"><span>D</span></div><div><span>Deme Ops</span><strong>Version {APP_VERSION}</strong><small>Product delivery · QA · signals · systems · operations</small></div><Palette size={18} /></section>
    </div>
  );
}
