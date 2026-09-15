import { useEffect, useState } from 'react';
import App from './App';
import { ConnectedDock } from './components/ConnectedDock';

export default function AppV6() {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const status = await window.demeRoadmap?.securityStatus();
        if (active) setUnlocked(Boolean(status?.unlocked));
      } catch {
        if (active) setUnlocked(false);
      }
    }
    check();
    const timer = window.setInterval(check, 1200);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const disposeExternal = window.demeRoadmap?.onRoadmapExternalChange(() => {
      window.setTimeout(() => window.location.reload(), 180);
    });
    const disposeRemoteLock = window.demeRoadmap?.onRemoteLock(() => {
      window.location.reload();
    });
    return () => {
      disposeExternal?.();
      disposeRemoteLock?.();
    };
  }, []);

  return (
    <>
      <App />
      {unlocked && <ConnectedDock />}
    </>
  );
}
