import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Хаптик-обёртки. На web/desktop (в т.ч. Tauri — это web-сборка) хаптика нет и
// expo-haptics может бросить даже синхронно — поэтому Platform-гард + try/catch.
function safe(fn: () => Promise<unknown>) {
  if (Platform.OS === 'web') return;
  try { fn().catch(() => {}); } catch { /* no-op */ }
}

export function hapticTap() { safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); }
export function hapticMedium() { safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)); }
export function hapticSuccess() { safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); }
export function hapticError() { safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)); }
