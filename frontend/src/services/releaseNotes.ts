/* psygames-release-notes · VER 1 · 04.10.2026 */
import { WHATS_NEW, type WhatsNewEntry } from '@/src/constants/whatsNew';
import { isNewer } from './appUpdates';

/** Only installed releases, newest first. Never drop an intermediate update. */
export function unreadReleaseNotes(current: string, seen: string,
  history: readonly WhatsNewEntry[] = WHATS_NEW): WhatsNewEntry[] {
  if (!seen) return []; // First install is not an update; keep onboarding unobstructed.
  const knownSeen = /^\d+\.\d+\.\d+$/.test(seen);
  const versions = new Set<string>();
  return history.filter((entry) => {
    if (versions.has(entry.version)) return false;
    versions.add(entry.version);
    if (entry.version !== current && !isNewer(current, entry.version)) return false;
    // An unreadable legacy version cannot identify a range; show this release safely.
    return knownSeen ? isNewer(entry.version, seen) : entry.version === current;
  }).sort((a, b) => a.version === b.version ? 0 : isNewer(a.version, b.version) ? -1 : 1);
}
