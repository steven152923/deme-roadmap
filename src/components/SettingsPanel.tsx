import { Download, FolderOpen, Plus, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import type { RoadmapSettings } from '../types';

export function SettingsPanel({ settings, dataPath, onChange, onBackup, onRestore, onRevealData }: {
  settings: RoadmapSettings;
  dataPath: string;
  onChange: (patch: Partial<RoadmapSettings>) => void;
  onBackup: () => void;
  onRestore: () => void;
  onRevealData: () => void;
}) {
  const [newArea, setNewArea] = useState('');
  function addArea() {
    const value = newArea.trim();
    if (!value || settings.areas.some((area) => area.toLowerCase() === value.toLowerCase())) return;
    onChange({ areas: [...settings.areas, value] });
    setNewArea('');
  }
  return (
    <div className="settings-page">
      <section className="settings-section">
        <div className="settings-heading"><span className="eyebrow">Behaviour</span><h3>Make the little workspace yours</h3></div>
        <label className="settings-row"><span><strong>Start screen</strong><small>What opens first when Deme Roadmap launches.</small></span><select value={settings.startView === 'releases' ? 'board' : settings.startView} onChange={(event) => onChange({ startView: event.target.value as RoadmapSettings['startView'] })}><option value="focus">Focus</option><option value="inbox">Idea inbox</option><option value="board">Release board</option><option value="timeline">Roadmap</option><option value="list">All items</option></select></label>
        <label className="settings-row"><span><strong>Compact board cards</strong><small>Fit more work on screen with shorter cards.</small></span><input type="checkbox" checked={settings.compactCards} onChange={(event) => onChange({ compactCards: event.target.checked })} /></label>
        <label className="settings-row"><span><strong>Show Completed lane</strong><small>Hide the final lane if you only care about active work.</small></span><input type="checkbox" checked={settings.showShippedOnBoard} onChange={(event) => onChange({ showShippedOnBoard: event.target.checked })} /></label>
        <label className="settings-row"><span><strong>Confirm permanent deletion</strong><small>Ask before an item disappears forever.</small></span><input type="checkbox" checked={settings.confirmPermanentDelete} onChange={(event) => onChange({ confirmPermanentDelete: event.target.checked })} /></label>
        <label className="settings-row"><span><strong>Due-soon window</strong><small>How many days Focus treats as “due soon”.</small></span><div className="number-setting"><input type="number" min={1} max={30} value={settings.dueSoonDays} onChange={(event) => onChange({ dueSoonDays: Math.min(30, Math.max(1, Number(event.target.value) || 1)) })} /><span>days</span></div></label>
      </section>

      <section className="settings-section">
        <div className="settings-heading"><span className="eyebrow">Areas</span><h3>Deme product areas</h3><p>These power dropdowns and roadmap lanes.</p></div>
        <div className="area-settings-list">{settings.areas.map((area) => <span key={area}>{area}<button type="button" disabled={settings.areas.length <= 1} onClick={() => onChange({ areas: settings.areas.filter((item) => item !== area) })}><Trash2 size={12} /></button></span>)}</div>
        <div className="inline-add settings-inline-add"><input value={newArea} onChange={(event) => setNewArea(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), addArea())} placeholder="New area" /><button type="button" onClick={addArea}><Plus size={15} /> Add area</button></div>
      </section>

      <section className="settings-section">
        <div className="settings-heading"><span className="eyebrow">Local data</span><h3>Your roadmap still stays on this PC</h3><p>No cloud account or Deme production dependency. Backups are normal JSON files.</p></div>
        <div className="data-location"><div><strong>Roadmap file</strong><code>{dataPath || 'Loading local path…'}</code></div><button type="button" onClick={onRevealData}><FolderOpen size={15} /> Show in folder</button></div>
        <div className="settings-data-actions"><button type="button" onClick={onBackup}><Download size={16} /> Back up roadmap</button><button type="button" onClick={onRestore}><Upload size={16} /> Restore backup</button></div>
      </section>

      <section className="about-card"><div className="about-mark"><span>D</span><i /></div><div><span>Deme Roadmap</span><strong>Version 0.4.1</strong><small>Startup patch · QA workspace · local-first Windows build</small></div></section>
    </div>
  );
}
