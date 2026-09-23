/**
 * 🔴 КНОПКА «СКАЧАТЬ» ВЕДЁТ В МАГАЗИН, А НЕ НА САЙТ (решение Дениса 23.09.2026).
 *
 * Замер того же дня: у iOS ветки не было вовсе, iPhone уходил на psy-games.pro,
 * где сборки для него нет и не будет — правило «веб-версии приложения на сайте
 * быть не может, только семплы». Android-ссылка была верной, хотя задача 16dfede6
 * описывала её как битую.
 *
 * ⚠️ Проба смотрит ИСХОДНИК, а не вызывает функцию: она зависит от Platform и
 * navigator, и подделывать их ради трёх строк дороже, чем проверить сами адреса.
 * Зато проба ловит главное — что в файле нет пути «мобильный → сайт».
 */
import fs from 'fs';
import path from 'path';

const ИСХОДНИК = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'appUpdates.ts'), 'utf8');

const ФУНКЦИЯ = ИСХОДНИК.slice(
  ИСХОДНИК.indexOf('export function updateUrl'),
  ИСХОДНИК.indexOf('/** Версия, чей'));

describe('кнопка «Скачать» ведёт в магазин', () => {
  it('🔴 у iOS есть свой адрес и это App Store', () => {
    expect(ФУНКЦИЯ).toMatch(/Platform\.OS === 'ios'/);
    expect(ФУНКЦИЯ).toMatch(/apps\.apple\.com\/app\/id6779208225/);
  });

  it('🔴 Android ведёт на магазинный идентификатор com.psygames.app', () => {
    expect(ФУНКЦИЯ).toMatch(/play\.google\.com[^']*id=com\.psygames\.app/);
    // com.odv999.psygames — настольная сборка, в Play её нет (404, замер 23.09)
    expect(ФУНКЦИЯ).not.toMatch(/id=com\.odv999\.psygames/);
  });

  it('🔴 iPhone внутри Tauri (Platform.OS === web) тоже уходит в App Store', () => {
    expect(ФУНКЦИЯ).toMatch(/iphone\|ipad\|ipod/i);
  });

  it('на сайт остаётся только настольная ветка и веб', () => {
    const сайт = (ФУНКЦИЯ.match(/psy-games\.pro/g) || []).length;
    expect(сайт).toBe(2);   // web + Mac/Win; мобильных среди них нет
  });
});
