/** A warmup can run a full level without becoming a fixed measurement preset.
 * Keep wu=1 for playlist ownership; progress=1 opts into the separate training ladder.
 */
import { nativeScreenOver } from '@/src/services/hostSessions';

export function isProgressiveWarmup(params: Record<string, unknown> | undefined): boolean {
  return params?.wu === '1' && params?.progress === '1';
}

export function trainingLevelId(gameId: string, progressive: boolean): string {
  return progressive ? `${gameId}_warmup` : gameId;
}

/** API saves are outside React: inspect the launch URL, not playlist activity
 * (assessment/rest playlists are active too). Native reports carry their own tag.
 */
export function progressiveWarmupLocation(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location?.search ?? '');
  return isProgressiveWarmup({ wu: q.get('wu'), progress: q.get('progress') });
}

/** The overlay signal also covers teardown. On progressive launches, guard the
 * native route before the overlay signal arrives: that web copy never owns a round.
 */
export function webOwnsLevelProgress(progressive: boolean): boolean {
  if (nativeScreenOver()) return false;
  if (!progressive || typeof window === 'undefined') return true;
  // Same injected route/bridge contract as hostRendersNatively, without importing
  // hostWarmup's playlist + translation/UI graph into the storage API.
  const w = window as unknown as {
    __psyHostNativeRoutes?: unknown;
    PsyBridge?: { postMessage?: unknown };
  };
  return typeof w.PsyBridge?.postMessage !== 'function'
    || !Array.isArray(w.__psyHostNativeRoutes)
    || !w.__psyHostNativeRoutes.includes(window.location?.pathname ?? '');
}
