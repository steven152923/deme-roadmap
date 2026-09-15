import { Search } from 'lucide-react';
import { useState } from 'react';

export function OpsSearchBridge() {
  const [value, setValue] = useState('');

  function update(next: string) {
    setValue(next);
    const input = document.querySelector<HTMLInputElement>('.search-box input');
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return (
    <label className="ops-search-bridge">
      <Search size={14} />
      <input value={value} onChange={(event) => update(event.target.value)} placeholder="Search this workspace…" />
    </label>
  );
}
