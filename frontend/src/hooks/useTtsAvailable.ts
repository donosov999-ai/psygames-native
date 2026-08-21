import { useEffect, useState } from 'react';
import { ttsAvailable, ttsBlockedReason, type TtsBlock } from '@/src/services/tts';

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

/**
 * ПОЧЕМУ УПРАЖНЕНИЕ СЕЙЧАС НЕ ЗАГОВОРИТ — для экрана, а не для сервиса.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНО ОТ `useTtsAvailable`. Тот отвечает только про голос в
 * системе, и экраны показывали одно предупреждение на две разные беды. Человек
 * с выключенным звуком шёл искать, какой голос ему поставить, — а надо было
 * тронуть тумблер.
 *
 * ⚠️ ТУМБЛЕР ЧИТАЕТСЯ НА КАЖДОМ ФОКУСЕ ЭКРАНА. Он живёт в модуле, а не в
 * состоянии React: подписки на него нет, и без перечитывания человек, сходивший
 * в настройки и вернувшийся, увидел бы прежнее предупреждение.
 */
export function useTtsBlock(lang: string): TtsBlock {
  const [block, setBlock] = useState<TtsBlock>('no-voice');

  useEffect(() => {
    const refresh = () => setBlock(ttsBlockedReason(lang));
    refresh();
    const speech = typeof window !== 'undefined'
      ? (window as any).speechSynthesis as SpeechSynthesis | undefined
      : undefined;
    speech?.addEventListener?.('voiceschanged', refresh);
    // возвращение на экран после настроек
    const onFocus = () => refresh();
    if (typeof window !== 'undefined') window.addEventListener?.('focus', onFocus);
    const tick = setInterval(refresh, 1000);
    return () => {
      speech?.removeEventListener?.('voiceschanged', refresh);
      if (typeof window !== 'undefined') window.removeEventListener?.('focus', onFocus);
      clearInterval(tick);
    };
  }, [lang]);

  return block;
}
