/**
 * 🔴 КНОПКА «СКАЧАТЬ» ВЕДЁТ В МАГАЗИН, А НЕ НА САЙТ (решение Дениса 23.09.2026).
 *
 * Замер того же дня: у iOS ветки не было вовсе, iPhone уходил на psy-games.pro,
 * где сборки для него нет и не будет — правило «веб-версии приложения на сайте
 * быть не может, только семплы». Android-ссылка была верной, хотя задача 16dfede6
 * описывала её как битую.
 *
 * ⚠️ Проба смотрит исходник, а не вызывает функцию: она зависит от Platform и
 * navigator, и подделывать их ради трёх строк дороже, чем проверить сами адреса.
 * Зато проба ловит главное — что в файле нет пути «мобильный → сайт».
 */
/**
 * ⚠️ Узловые глобали объявлены руками, а не взяты из @types/node: в tsconfig проб типов
 * node нет, и `import fs from 'fs'` валит tsc (TS2591/TS2304), а с ним и весь CI —
 * после него джобы не идут. Так же сделано в соседних пробах (evening-calm и др.).
 */
declare const __dirname: string;
declare function require(id: string): any;    
const fs = require('fs');                     
const path = require('path');                 

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'appUpdates.ts'), 'utf8');

const FUNC = SOURCE.slice(
  SOURCE.indexOf('export function updateUrl'),
  SOURCE.indexOf('/** Версия, чей'));

describe('кнопка «Скачать» ведёт в магазин', () => {
  it('🔴 у iOS есть свой адрес и это App Store', () => {
    expect(FUNC).toMatch(/Platform\.OS === 'ios'/);
    expect(FUNC).toMatch(/apps\.apple\.com\/app\/id6779208225/);
  });

  it('🔴 Android ведёт на магазинный идентификатор com.psygames.app', () => {
    expect(FUNC).toMatch(/play\.google\.com[^']*id=com\.psygames\.app/);
    // com.odv999.psygames — настольная сборка, в Play её нет (404, замер 23.09)
    expect(FUNC).not.toMatch(/id=com\.odv999\.psygames/);
  });

  it('🔴 iPhone внутри Tauri (Platform.OS === web) тоже уходит в App Store', () => {
    expect(FUNC).toMatch(/iphone\|ipad\|ipod/i);
  });

  it('на сайт остаётся только настольная ветка и веб', () => {
    const siteLinks = (FUNC.match(/psy-games\.pro/g) || []).length;
    expect(siteLinks).toBe(2);   // web + Mac/Win; мобильных среди них нет
  });
});
