let quiet = false;

export function quietWarmupActive(): boolean { return quiet; }

/** Temporary playback state, never writes the person's sound preference. */
export function setQuietWarmupActive(next: boolean): void {
  if (quiet === next) return;
  quiet = next;
  if (next && typeof window !== 'undefined') {
    try { window.speechSynthesis?.cancel(); } catch { /* host may not provide speech */ }
  }
}
