/**
 * 🔴 «ПРОВЕРИТЬ ОБНОВЛЕНИЯ» ЧИТАЕТ ЖИВОЙ ФАЙЛ И СТРОКУ СВОЕЙ ПЛАТФОРМЫ (задача ea32be45).
 *
 * Замер 02.10.2026: https://psy-games.pro/play/version.json отдавал 2.54.24, а приложение
 * было 2.56.4. Файл писало задание `release` выпуска Tauri, которое закрыли 07.09, —
 * и кнопка в настройках, и суточная автопроверка с тех пор всегда отвечали «у вас
 * последняя». Теперь источник — releases.json со строкой на платформу: Play выпускает
 * сразу, App Store — после ревью, и одна общая версия звала бы iPhone в магазин, где
 * сборки ещё нет.
 */
declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

import { latestFor, isNewer } from '@/src/services/appUpdates';

const SOURCE: string = fs.readFileSync(path.join(__dirname, '..', 'services', 'appUpdates.ts'), 'utf8');

describe('проверка обновлений — источник и строка платформы', () => {
  it('🔴 спрашивает releases.json, а не застывший /play/version.json', () => {
    expect(SOURCE).toMatch(/VERSION_URL = 'https:\/\/psy-games\.pro\/releases\.json'/);
    expect(SOURCE).not.toMatch(/VERSION_URL = '[^']*\/play\//);
  });

  it('🔴 берёт строку своей платформы', () => {
    const j = { android: '2.56.5', ios: '2.56.0', desktop: '' };
    expect(latestFor(j, 'android')).toBe('2.56.5');
    expect(latestFor(j, 'ios')).toBe('2.56.0');
  });

  it('🔴 нет строки платформы — молчит, общую version НЕ берёт', () => {
    // Старый формат { version } без строки iOS не должен звать iPhone в App Store.
    const j = { version: '9.9.9', android: '2.56.5', ios: '' };
    expect(latestFor(j, 'ios')).toBe('');
    expect(latestFor(j, 'desktop')).toBe('');
    expect(latestFor({ version: '9.9.9' }, 'android')).toBe('');
  });

  it('мусор в файле — тоже молчание, без исключения', () => {
    expect(latestFor(null, 'android')).toBe('');
    expect(latestFor({ android: 256 }, 'android')).toBe('');
    expect(latestFor({ android: ' 2.56.5 ' }, 'android')).toBe('2.56.5');
  });

  it('сравнение версий: 2.56.5 новее 2.56.4, пустая строка не новее ничего', () => {
    expect(isNewer('2.56.5', '2.56.4')).toBe(true);
    expect(isNewer('', '2.56.4')).toBe(false);
  });
});
