/**
 * Локальные напоминания (Phase 1) — ежедневная зарядка / перед сном.
 *
 * Только НАТИВ (iOS/Android) через expo-notifications + локальный daily-триггер.
 * НЕ требует APNs/сервера. На web/Tauri — no-op (Platform.OS guard).
 * Тап по уведомлению → data.type ('morning'|'evening') → запуск комплекса
 * (обрабатывается в app/_layout.tsx через NotificationTapHandler).
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { translateFor } from '@/src/contexts/LanguageContext';

const KEY = 'psygames_reminders';

export interface ReminderSettings {
  morning: boolean;
  morningHour: number; // 24h
  evening: boolean;
  eveningHour: number;
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  morning: false,
  morningHour: 9,
  evening: false,
  eveningHour: 22,
};

// Foreground behaviour — показывать баннер даже когда апп открыт (только натив).
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

// Тексты уведомлений — в словаре LanguageContext (remindMorning*/remindEvening*, все 12 языков).
// Сервис вне React-дерева → translateFor(lang, key), lang приходит параметром.

export async function loadReminderSettings(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_REMINDERS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_REMINDERS };
}

export async function saveReminderSettings(s: ReminderSettings): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

/** Запросить разрешение на уведомления. true = выдано. На web — false. */
export async function requestReminderPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.status === 'granted') return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted || req.status === 'granted';
  } catch {
    return false;
  }
}

/** Перепланировать все напоминания согласно настройкам (cancel-all → schedule). */
export async function applyReminders(s: ReminderSettings, lang: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (s.morning) {
      await Notifications.scheduleNotificationAsync({
        content: { title: translateFor(lang, 'remindMorningTitle'), body: translateFor(lang, 'remindMorningBody'), data: { type: 'morning' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: s.morningHour, minute: 0 },
      });
    }
    if (s.evening) {
      await Notifications.scheduleNotificationAsync({
        content: { title: translateFor(lang, 'remindEveningTitle'), body: translateFor(lang, 'remindEveningBody'), data: { type: 'evening' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: s.eveningHour, minute: 0 },
      });
    }
  } catch {}
}
