import { useEffect, useState } from 'react';

// One shared implementation of "am I online right now", imported by every
// component that needs to degrade gracefully instead of silently failing a
// fetch (Lessons offline review — see CLAUDE.md/PRD for scope).
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
