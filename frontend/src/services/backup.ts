/**
 * Backup / Restore прогресса (v1.15.0)
 *
 * Экспорт/импорт ВСЕХ данных PsyGames из AsyncStorage в JSON-файл.
 * Денис: «чтобы правки не потерялись при апдейте / смене устройства».
 *
 * Что бэкапится: всё под префиксом `psygames_` —
 *   - psygames_cognitive_sessions  (вся история игр — главное)
 *   - psygames_warmup_history       (зарядка, streak)
 *   - psygames_assessment_history   (G1 оценки)
 *   - psygames_achievements_unlocked
 *   - psygames_unlocked_themed      (введённые коды)
 *   - psygames_active_profile, _theme, _language, _sound_enabled, etc.
 *
 * Платформы:
 *   - Web / Tauri WebView: Blob download + <input type=file>
 *   - Native (iOS/Android): пока через clipboard (Share API в отдельном спринте)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const PREFIX = 'psygames_';
const BACKUP_MAGIC = 'PsyGames-Backup';
const BACKUP_FORMAT_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_MAGIC;
  format: number;
  app_version?: string;
  exported_at: string;
  device?: string;
  data: Record<string, string>;
}

/** Собрать все psygames_-ключи в JSON-строку. */
export async function buildBackupJSON(appVersion?: string): Promise<string> {
  const allKeys = await AsyncStorage.getAllKeys();
  const keys = allKeys.filter((k) => k.startsWith(PREFIX));
  const entries = await AsyncStorage.multiGet(keys);
  const data: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (v != null) data[k] = v;
  }
  const backup: BackupFile = {
    app: BACKUP_MAGIC,
    format: BACKUP_FORMAT_VERSION,
    app_version: appVersion,
    exported_at: new Date().toISOString(),
    device: Platform.OS,
    data,
  };
  return JSON.stringify(backup, null, 2);
}

/** Применить backup-JSON в AsyncStorage. Возвращает кол-во восстановленных ключей. */
export async function restoreBackupJSON(json: string): Promise<{ restored: number; keys: string[] }> {
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Файл не читается — это не JSON');
  }
  if (parsed.app !== BACKUP_MAGIC || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Это не похоже на бэкап PsyGames');
  }
  const pairs: [string, string][] = Object.entries(parsed.data)
    .filter(([k]) => k.startsWith(PREFIX))   // safety — только наши ключи
    .map(([k, v]) => [k, String(v)]);
  if (pairs.length === 0) throw new Error('В бэкапе нет данных PsyGames');
  await AsyncStorage.multiSet(pairs);
  return { restored: pairs.length, keys: pairs.map(([k]) => k) };
}

/**
 * Скачать backup как файл (web/Tauri). На native — кидает ошибку
 * (caller должен показать fallback типа clipboard).
 */
export async function downloadBackup(appVersion?: string): Promise<void> {
  const json = await buildBackupJSON(appVersion);
  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `psygames-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    // Native fallback — caller обработает (пока бросаем для clipboard-варианта)
    throw new Error('NATIVE_NO_DOWNLOAD');
  }
}

/**
 * Открыть file-picker и восстановить (web/Tauri). Возвращает результат restore.
 * На native — кидает ошибку (caller показывает paste-вариант).
 */
export async function pickAndRestoreBackup(): Promise<{ restored: number; keys: string[] }> {
  if (Platform.OS !== 'web') {
    throw new Error('NATIVE_NO_FILEPICKER');
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('Файл не выбран'));
      try {
        const text = await file.text();
        const result = await restoreBackupJSON(text);
        resolve(result);
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
