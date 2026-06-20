import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { sndTap as _sfxTap, sndCorrect as _sfxCorrect, sndWrong as _sfxError } from '@/src/services/feedback';

// Хаптик-обёртки. На web/desktop (в т.ч. Tauri — это web-сборка) хаптика нет и
// expo-haptics может бросить даже синхронно — поэтому Platform-гард + try/catch.
function safe(fn: () => Promise<unknown>) {
  if (Platform.OS === 'web') return;
  try { fn().catch(() => {}); } catch { /* no-op */ }
}

// Каждая обёртка = хаптик (натив) + звук (веб/десктоп). Гарды внутри → срабатывает нужное под платформу.
export function hapticTap() { _sfxTap(); safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); }
export function hapticMedium() { safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)); }
export function hapticSuccess() { _sfxCorrect(); safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); }
export function hapticError() { _sfxError(); safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)); }
