import React from 'react';
import { AppState, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { getMusicEnabled, startMusic, stopMusic } from '@/src/services/feedback';
import { disposeMusic, setMusicSuspended } from '@/src/services/music';
import { menuMusicAllowed } from '@/src/services/musicRoute';

/** Mounted ONCE in root, not Home. App navigation is not audio ownership. */
export default function AppMusicHost() {
  const path = usePathname();
  React.useEffect(() => {
    let alive = true;
    getMusicEnabled().then((on) => { if (alive && on) startMusic(); }).catch(() => {});
    return () => { alive = false; stopMusic(); disposeMusic(); };
  }, []);

  React.useEffect(() => {
    const syncRoute = () => setMusicSuspended('route', !menuMusicAllowed(path, (globalThis as any).__psyMusicNativeRoute?.route));
    syncRoute();
    if (typeof window === 'undefined') return;
    window.addEventListener('psygames-music-route', syncRoute);
    return () => window.removeEventListener('psygames-music-route', syncRoute);
  }, [path]);

  React.useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const visibility = () => setMusicSuspended('background', document.visibilityState === 'hidden');
      const retry = () => startMusic(); // synchronous gesture, preference checked in feedback
      visibility();
      document.addEventListener('visibilitychange', visibility);
      document.addEventListener('pointerdown', retry, true);
      document.addEventListener('keydown', retry, true);
      return () => {
        document.removeEventListener('visibilitychange', visibility);
        document.removeEventListener('pointerdown', retry, true);
        document.removeEventListener('keydown', retry, true);
      };
    }
    const sub = AppState.addEventListener('change', (s) => setMusicSuspended('background', s !== 'active'));
    return () => sub.remove();
  }, []);
  return null;
}
