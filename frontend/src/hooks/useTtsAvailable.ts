import { useEffect, useState } from 'react';
import { ttsAvailable } from '@/src/services/tts';

/**
 * Hydration-safe Web Speech availability.
 *
 * Static rendering has no `window`, while the browser usually has
 * `speechSynthesis` immediately. Starting both sides at `false` keeps the
 * first render identical; the effect then refreshes availability and also
 * follows the delayed `voiceschanged` event used by Chromium/WebView.
 */
export function useTtsAvailable(lang: string): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const refresh = () => setAvailable(ttsAvailable(lang));
    refresh();

    const speech = typeof window !== 'undefined'
      ? (window as any).speechSynthesis as SpeechSynthesis | undefined
      : undefined;
    speech?.addEventListener?.('voiceschanged', refresh);
    return () => speech?.removeEventListener?.('voiceschanged', refresh);
  }, [lang]);

  return available;
}
