/**
 * dataTransfer — перенос прогресса между установками (v1.127.0).
 *
 * Зачем: прогресс (достижения, уровни, токены, стрик, сессии, настройки) живёт
 * только в локальном AsyncStorage конкретной установки. Веб, старый APK и версия
 * из Google Play — РАЗНЫЕ изолированные хранилища, между ними ничего не переезжает.
 * Репорт: Валя скачала из Play — её достижения из старого APK не видны.
 *
 * Решение: экспорт всех ключей `psygames_*` в переносимый код (base64) → импорт
 * на другой установке. device_id НЕ переносим — он должен оставаться уникальным
 * на каждую установку (иначе две установки станут неотличимы в фидбеке).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'psygames_';
const EXCLUDE = new Set(['psygames_device_id']);   // уникален на установку — не переносим

/** unicode-safe base64 (кириллица в значениях) */
function b64encode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}
function b64decode(s: string): string {
  return decodeURIComponent(escape(atob(s)));
}

/** Собрать весь прогресс в переносимый код. */
export async function exportProgress(): Promise<string> {
  const keys = (await AsyncStorage.getAllKeys()).filter(
    (k) => k.startsWith(PREFIX) && !EXCLUDE.has(k)
  );
  const pairs = await AsyncStorage.multiGet(keys);
  const data: Record<string, string> = {};
  for (const [k, v] of pairs) if (v != null) data[k] = v;
  const payload = JSON.stringify({ v: 1, ts: Date.now(), n: keys.length, data });
  return b64encode(payload);
}

export interface ImportResult {
  ok: boolean;
  count: number;
  error?: string;
}

/** Применить код с другой установки. Пишет ключи в AsyncStorage (перезапись). */
export async function importProgress(code: string): Promise<ImportResult> {
  try {
    const clean = (code || '').trim();
    if (!clean) return { ok: false, count: 0, error: 'empty' };
    const parsed = JSON.parse(b64decode(clean));
    if (!parsed?.data || typeof parsed.data !== 'object') {
      return { ok: false, count: 0, error: 'bad-format' };
    }
    const entries = Object.entries(parsed.data as Record<string, unknown>).filter(
      ([k, v]) => k.startsWith(PREFIX) && !EXCLUDE.has(k) && typeof v === 'string'
    ) as [string, string][];
    if (!entries.length) return { ok: false, count: 0, error: 'no-keys' };
    await AsyncStorage.multiSet(entries);
    return { ok: true, count: entries.length };
  } catch (e) {
    return { ok: false, count: 0, error: String(e).slice(0, 120) };
  }
}
