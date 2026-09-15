import { Download, FolderOpen, LockKeyhole, Palette, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import type { RoadmapSettings, SecurityActionResult, ThemePreset } from '../types';

const THEMES: { id: ThemePreset; name: string; description: string }[] = [
  { id: 'candy', name: 'Candy Cloud', description: 'Pink, lilac and sky-blue clouds with soft floating cards.' },
  { id: 'night', name: 'Night Bloom', description: 'Deep plum and navy with glowing pastel details.' },
  { id: 'paper', name: 'Paper Pop', description: 'Warm paper, sticker shapes, coral, mint and lilac.' },
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
    <div className="settings-page v5-settings">
      <section className="settings-section style-studio-section">
        <div className="settings-heading"><span className="eyebrow">Style studio</span><h3>Pick the whole personality</h3><p>These are complete interface skins, not tiny accent-colour swaps.</p></div>
        <div className="theme-choice-grid">{THEMES.map((theme) => <button type="button" key={theme.id} className={`theme-choice theme-${theme.id} ${settings.themePreset === theme.id ? 'active' : ''}`} onClick={() => onChange({ themePreset: theme.id })}><div className="theme-preview"><i /><i /><i /><span /></div><div><strong>{theme.name}</strong><small>{theme.description}</small></div>{settings.themePreset === theme.id && <span className="theme-selected">Using</span>}</button>)}</div>
      </section>

      <section className="settings-section">
        <div className="settings-heading"><span className="eyebrow">Behaviour</span><h3>Make the little workspace yours</h3></div>
        <label className="settings-row"><span><strong>Start screen</strong><small>What opens first after Roadmap is unlocked.</small></span><select value={settings.startView} onChange={(event) => onChange({ startView: event.target.value as RoadmapSettings['startView'] })}><option value="focus">Focus</option><option value="board">Release board</option><option value="calendar">Calendar</option><option value="inbox">Idea inbox</option><option value="notes">Notes</option><option value="decisions">Decision log</option><option value="qa">QA test runs</option><option value="launch">Launch center</option><option value="timeline">Roadmap</option><option value="list">All items</option></select></label>
        <label className="settings-row"><span><strong>Compact board cards</strong><small>Fit more work on screen with shorter cards.</small></span><input type="checkbox" checked={settings.compactCards} onChange={(event) => onChange({ compactCards: event.target.checked })} /></label>
        <label className="settings-row"><span><strong>Show Completed lane</strong><small>Hide the final lane if you only care about active work.</small></span><input type="checkbox" checked={settings.showShippedOnBoard} onChange={(event) => onChange({ showShippedOnBoard: event.target.checked })} /></label>
        <label className="settings-row"><span><strong>Confirm permanent deletion</strong><small>Ask before an item disappears forever.</small></span><input type="checkbox" checked={settings.confirmPermanentDelete} onChange={(event) => onChange({ confirmPermanentDelete: event.target.checked })} /></label>
        <label className="settings-row"><span><strong>Due-soon window</strong><small>How many days Focus treats as “due soon”.</small></span><div className="number-setting"><input type="number" min={1} max={30} value={settings.dueSoonDays} onChange={(event) => onChange({ dueSoonDays: Math.min(30, Math.max(1, Number(event.target.value) || 1)) })} /><span>days</span></div></label>
      </section>

      <section className="settings-section security-settings-section">
        <div className="settings-heading"><span className="eyebrow">Privacy lock</span><h3><ShieldCheck size={19} /> This workspace has a door now</h3><p>Your passcode lives in Windows app data as a salted verifier and is not included in roadmap backups.</p></div>
        <label className="settings-row"><span><strong>Lock after inactivity</strong><small>Manual lock and Ctrl+L always work. Fully closing Roadmap always locks the next launch.</small></span><select value={autoLockMinutes} onChange={async (event) => { const minutes = Number(event.target.value); const result = await onAutoLockChange(minutes); setSecurityMessage(result.ok ? 'Auto-lock updated ✓' : result.error || 'Could not update auto-lock.'); }}><option value={0}>Off</option><option value={5}>5 minutes</option><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option></select></label>
        <div className="passcode-change-card"><div className="passcode-change-title"><LockKeyhole size={17} /><span><strong>Change passcode</strong><small>You need the current passcode first.</small></span></div><div className="passcode-change-fields"><input type="password" inputMode="numeric" value={currentPasscode} onChange={(event) => setCurrentPasscode(event.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Current" /><input type="password" inputMode="numeric" value={nextPasscode} onChange={(event) => setNextPasscode(event.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="New 4–12 digits" /><input type="password" inputMode="numeric" value={confirmPasscode} onChange={(event) => setConfirmPasscode(event.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Confirm new" /><button type="button" disabled={securityBusy || !currentPasscode || !nextPasscode || !confirmPasscode} onClick={changePasscode}>{securityBusy ? 'Changing…' : 'Change'}</button></div>{securityMessage && <div className="security-settings-message">{securityMessage}</div>}<small className="passcode-warning">There is deliberately no “show me my passcode” button. Keep it somewhere safe.</small></div>
      </section>

      <section className="settings-section">
        <div className="settings-heading"><span className="eyebrow">Areas</span><h3>Deme product areas</h3><p>These power dropdowns and roadmap lanes.</p></div>
        <div className="area-settings-list">{settings.areas.map((area) => <span key={area}>{area}<button type="button" disabled={settings.areas.length <= 1} onClick={() => onChange({ areas: settings.areas.filter((item) => item !== area) })}><Trash2 size={12} /></button></span>)}</div>
        <div className="inline-add settings-inline-add"><input value={newArea} onChange={(event) => setNewArea(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), addArea())} placeholder="New area" /><button type="button" onClick={addArea}><Plus size={15} /> Add area</button></div>
      </section>

      <section className="settings-section">
        <div className="settings-heading"><span className="eyebrow">Local data</span><h3>Your workspace still stays on this PC</h3><p>No Deme production dependency. Backups are normal JSON files and include notes, decisions and launch plans.</p></div>
        <div className="data-location"><div><strong>Roadmap file</strong><code>{dataPath || 'Loading local path…'}</code></div><button type="button" onClick={onRevealData}><FolderOpen size={15} /> Show in folder</button></div>
        <div className="settings-data-actions"><button type="button" onClick={onBackup}><Download size={16} /> Back up workspace</button><button type="button" onClick={onRestore}><Upload size={16} /> Restore backup</button></div>
      </section>

      <section className="about-card"><div className="about-mark"><span>D</span><i /></div><div><span>Deme Roadmap</span><strong>Version 0.5.0</strong><small>Private workspace · three styles · calendar · notes · decisions · launch center</small></div><Palette size={18} /></section>
    </div>
  );
}
