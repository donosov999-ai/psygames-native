import { NO_TAB_BAR_PREFIXES } from '@/src/services/tabBar';

/** Menus share one uninterrupted playlist. Active tasks retain the old quiet policy. */
export function menuMusicAllowed(path: string, nativeRoute?: string | null): boolean {
  const effective = (nativeRoute || path || '/').split('?')[0];
  return effective !== '/warmup' && !NO_TAB_BAR_PREFIXES.some((p) => effective.startsWith(p));
}
