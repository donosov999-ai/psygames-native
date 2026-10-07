/* psygames-flutter-settings-transfer-reference · VER 1 · 02.10.2026 */
/**
 * ЭТАЛОН ПЕРЕНОСА ПРОГРЕССА И РЕЗЕРВНОЙ КОПИИ ИЗ ЖИВОГО TS — для нативных настроек (задача eae0879c).
 *
 * Код переноса (`exportProgress`, `src/services/dataTransfer.ts`) и резервная копия
 * (`buildBackupJSON`, `src/services/backup.ts`) выданы веб-версией на старом телефоне — их
 * обязан принять нативный экран на новом, и наоборот. Поэтому эталон снимается с живых
 * функций на заданном наборе ключей, а проба `flutter/test/settings_transfer_test.dart`
 * читает его своей реализацией.
 *
 * Перевыпуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-settings-transfer-reference.test.ts'
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exportProgress, importProgress } from '@/src/services/dataTransfer';
import { buildBackupJSON } from '@/src/services/backup';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: string, e: string): void };
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };
const OUT = path.resolve(__dirname, '../../flutter/test/fixtures/settings-transfer-reference.json');

// Набор нарочно с кириллицей, эмодзи и JSON внутри значения — на них ломается base64 «как есть».
const DATA: Record<string, string> = {
  psygames_active_profile: 'odv999',
  psygames_sudoku_level_odv999: '92',
  psygames_pet_name: 'Синапс 🐾',
  psygames_unlocked_themed: '["chess"]',
  psygames_device_id: 'НЕ-ПЕРЕНОСИТСЯ',
  language: 'ru',
  'psygames.bestStreak.sudoku': '7',
};

describe('эталон переноса прогресса для Flutter', () => {
  it('выгружает', async () => {
    await AsyncStorage.clear();
    for (const [k, v] of Object.entries(DATA)) await AsyncStorage.setItem(k, v);
    const now = jest.spyOn(Date, 'now').mockReturnValue(1790880000000);
    const iso = jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-10-02T00:00:00.000Z');
    const code = await exportProgress();
    const backup = await buildBackupJSON('2.56.4');
    now.mockRestore();
    iso.mockRestore();
    // Обратный ход: код, собранный по правилам Flutter-стороны, веб обязан принять.
    // base64 от UTF-8 — то же, что делает Dart (`base64Encode(utf8.encode(…))`).
    const nativeStyle = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, ts: 1, n: 1, data: { psygames_x: 'ё' } }))));
    await AsyncStorage.clear();
    const back = await importProgress(nativeStyle);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ data: DATA, code, backup, nativeStyleAccepted: back }, null, 1) + '\n', 'utf8');
    expect(back.ok).toBe(true);
  });
});
