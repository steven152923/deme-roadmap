import { useEffect, useRef, useState } from 'react';
import App from './App';
import { OpsSearchBridge } from './components/OpsSearchBridge';
import { OpsShell } from './components/OpsShell';

export default function AppV6() {
  const [unlocked, setUnlocked] = useState(false);
  const reloadingRef = useRef(false);

  useEffect(() => {
    let active = true;
    async function checkSecurity() {
      try {
        const status = await window.demeRoadmap?.securityStatus();
        if (active) setUnlocked(Boolean(status?.unlocked));
      } catch {
        if (active) setUnlocked(false);
      }
    }
    checkSecurity();
    const timer = window.setInterval(checkSecurity, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const reloadOnce = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.setTimeout(() => window.location.reload(), 90);
    };
    const disposeExternal = window.demeRoadmap?.onRoadmapExternalChange(reloadOnce);
    const disposeRemoteLock = window.demeRoadmap?.onRemoteLock(reloadOnce);
    return () => {
      disposeExternal?.();
      disposeRemoteLock?.();
    };
  }, []);

  return (
    <>
      <App />
      {unlocked && <><OpsShell /><OpsSearchBridge /></>}
    </>
  );
}
