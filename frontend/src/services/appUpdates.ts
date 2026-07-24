/**
 * appUpdates — проверка новой версии + «что нового» после обновления.
 *
 * Источник правды о свежей версии: https://psy-games.pro/play/version.json —
 * его кладёт CI (job play-deploy) при каждом релиз-теге. GitHub Releases не
 * подходит: репо приватный, API из приложения без токена не достучаться.
 *
 * «Скачать»: Android → страница в Google Play; Mac/Win → страница загрузок
 * сайта; web — просто перезагрузка (там всегда свежая сборка).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const VERSION_URL = 'https://psy-games.pro/play/version.json';
const SEEN_KEY = 'psygames_last_seen_version';
const CHECKED_AT_KEY = 'psygames_update_checked_at';
export const CHECK_EVERY_MS = 24 * 3600 * 1000;   // тихая автопроверка раз в сутки

export function currentVersion(): string {
  return (Constants.expoConfig?.version as string) || '0.0.0';
}

/** a > b по semver-числам ('1.148.0' > '1.147.0'). Нечисловое — не сравниваем. */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export interface UpdateInfo { latest: string; hasUpdate: boolean; }

/** Спросить сайт о свежей версии. Ошибки сети = «обновлений нет» (тихо). */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const r = await fetch(`${VERSION_URL}?ts=${Date.now()}`, { cache: 'no-store' } as any);
    if (!r.ok) return null;
    const j = await r.json();
    const latest = String(j?.version || '');
    if (!latest) return null;
    return { latest, hasUpdate: isNewer(latest, currentVersion()) };
  } catch { return null; }
}

/** Автопроверка при старте: не чаще раза в сутки. null = рано или нет сети. */
export async function checkForUpdateDaily(): Promise<UpdateInfo | null> {
  try {
    const last = Number(await AsyncStorage.getItem(CHECKED_AT_KEY)) || 0;
    if (Date.now() - last < CHECK_EVERY_MS) return null;
    await AsyncStorage.setItem(CHECKED_AT_KEY, String(Date.now()));
    return await checkForUpdate();
  } catch { return null; }
}

/** Куда вести по кнопке «Скачать». */
export function updateUrl(): string {
  if (Platform.OS === 'web') return 'https://psy-games.pro/#download';
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/android/i.test(ua)) return 'https://play.google.com/store/apps/details?id=com.psygames.app';
  return 'https://psy-games.pro/#download';   // Mac/Win desktop (Tauri)
}

/** Версия, чей «Что нового» уже показан. '' = первый запуск. */
export async function getSeenVersion(): Promise<string> {
  try { return (await AsyncStorage.getItem(SEEN_KEY)) || ''; } catch { return ''; }
}
export async function setSeenVersion(v: string): Promise<void> {
  try { await AsyncStorage.setItem(SEEN_KEY, v); } catch {}
}
