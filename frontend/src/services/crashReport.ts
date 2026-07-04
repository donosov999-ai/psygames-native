/**
 * crashReport — краш-репорты в Supabase client_errors (замена Sentry без
 * внешнего сервиса). Fire-and-forget: сбой отправки не должен добить приложение.
 * Дедуп: одна и та же ошибка шлётся не чаще раза в 5 минут (анти-луп).
 */
import { Platform } from 'react-native';
import { getSupabase } from '@/src/services/supabase';

const recent = new Map<string, number>();
const DEDUP_MS = 5 * 60 * 1000;

export async function reportCrash(error: unknown, context?: string): Promise<void> {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const key = `${err.message}|${context || ''}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DEDUP_MS) return;
    recent.set(key, now);

    const person = (globalThis as any).__psygames_active_person as string | undefined;
    const row = {
      person: person || null,
      message: (err.message || 'unknown error').slice(0, 2000),
      stack: (err.stack || '').slice(0, 8000) || null,
      context: (context || '').slice(0, 400) || null,
      platform: Platform.OS,
      app_version: null as string | null,
    };
    try {
      const Constants = (await import('expo-constants')).default;
      row.app_version = (Constants.expoConfig?.version || '').slice(0, 32) || null;
    } catch {}
    const supabase = getSupabase();
    await supabase.from('client_errors').insert(row);
  } catch { /* репорт некритичен */ }
}
