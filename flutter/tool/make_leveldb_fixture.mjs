/**
 * ЭТАЛОН ДЛЯ ЧТЕНИЯ LOCALSTORAGE ANDROID-WEBVIEW — СНИМАЕТСЯ НАСТОЯЩИМ CHROMIUM.
 *
 * 🔴 ЗАЧЕМ ЭТОТ СКРИПТ ЛЕЖИТ В РЕПОЗИТОРИИ. Эталон — двоичный каталог LevelDB.
 * Двоичные данные без того, чем они сняты, не чинятся: через полгода никто не
 * скажет, что там внутри и как получить такой же. Правило проекта — экспортёр
 * живёт рядом с тем, что он производит.
 *
 * ЧТО ДЕЛАЕТ. Поднимает локальный сервер, подменяет ему имя на `tauri.localhost`
 * (так Chromium считает origin именно тем, под которым работала прежняя линия
 * PsyGames на Android), пишет через страницу ключи `psygames_*` и закрывает
 * браузер, чтобы всё легло на диск. Получившийся каталог `Local Storage/leveldb`
 * копируется в `flutter/test/fixtures/chromium_localstorage/`.
 *
 * ⚠️ ДАННЫЕ ПИШУТСЯ ДВУМЯ ПОРЦИЯМИ НАМЕРЕННО. Первая — крупная, чтобы Chromium
 * сбросил memtable в `.ldb` (сортированная таблица, блоки, сжатие snappy).
 * Вторая — мелкая, она остаётся в `.log` (журнал предзаписи). Эталон обязан
 * содержать ОБА файла: ридер, умеющий только одно из двух, молча потеряет
 * половину ключей, и на живом телефоне это выглядело бы как «часть прогресса
 * перенеслась».
 *
 * ЗАПУСК:  node flutter/tool/make_leveldb_fixture.mjs
 * Нужен установленный Chromium Playwright (он есть в frontend/node_modules).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ⚠️ Playwright стоит в `frontend/node_modules`, а скрипт живёт в `flutter/tool`.
// Обычный `import 'playwright'` ищет модули вверх от САМОГО ФАЙЛА и до frontend
// не дотягивается — падает ERR_MODULE_NOT_FOUND, даже если запускать из frontend.
// Поэтому резолвим явно от `frontend/package.json`.
const req = createRequire(path.join(HERE, '..', '..', 'frontend', 'package.json'));
const { chromium } = req('playwright');
const OUT = path.join(HERE, '..', 'test', 'fixtures', 'chromium_localstorage');

/** Ключи эталона. Подобраны так, чтобы задеть все ветки разбора значения. */
function payload() {
  return {
    // Чистая латиница — Chromium кладёт такое однобайтовой кодировкой.
    psygames_profile: 'nzt48',
    // Кириллица и эмодзи — двухбайтовая кодировка UTF-16LE, другая ветка.
    psygames_nickname: 'Денис · кот Маркиз 🐈',
    // Число строкой: счётчики прогресса хранятся так же.
    psygames_tokens_v1: '4212',
    psygames_sudoku_level_: '17',
    psygames_hanoi_best_: '31',
    // Крупный JSON — история партий. Не влезает в один блок сортированной
    // таблицы, значит проверяет переход между блоками.
    psygames_sessions: JSON.stringify(
      Array.from({ length: 400 }, (_, i) => ({
        id: `s-${i}`,
        game: ['sudoku', 'hanoi', 'schulte', 'stroop'][i % 4],
        ms: 40000 + i * 137,
        score: (i * 7) % 100,
        at: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
      })),
    ),
    // Пустая строка — отдельный случай: значение есть, длина ноль.
    psygames_onboarding_picked_nzt48: '',
    // Чужой ключ: перенос обязан его НЕ трогать.
    unrelated_cookie_banner: 'dismissed',
  };
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><meta charset="utf-8"><title>fixture</title>');
});

await new Promise((done) => server.listen(0, '127.0.0.1', done));
const port = server.address().port;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'psygames-leveldb-'));
const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  // Подмена имени: страница откроется с origin `http://tauri.localhost`, то есть
  // ровно с тем, под которым лежит прогресс прежней линии на Android.
  args: [`--host-resolver-rules=MAP tauri.localhost 127.0.0.1:${port}`],
});

const page = await ctx.newPage();
await page.goto('http://tauri.localhost/');

const data = payload();
// Порция первая — весь прогресс плюс немного балласта, чтобы крупный JSON
// истории заведомо не уместился в один блок сортированной таблицы.
await page.evaluate((d) => {
  for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v);
  for (let i = 0; i < 120; i++) localStorage.setItem(`ballast_${i}`, 'x'.repeat(2000));
}, data);
await page.waitForTimeout(1200);
await ctx.close();

// 🔴 ВТОРОЙ ЗАПУСК — ИМЕННО ОН ДЕЛАЕТ `.ldb`, А НЕ ОБЪЁМ ЗАПИСИ.
// Сброс памяти в сортированную таблицу LevelDB делает при превышении буфера
// записи (по умолчанию 4 МБ — столько в localStorage просто не поместится) ЛИБО
// при ОТКРЫТИИ базы: восстановление журнала записывает его содержимое в `.ldb`.
// Замер: одна порция любого разумного размера оставляет ровно один `.log` и ноль
// `.ldb`. Поэтому браузер закрывается и открывается снова — ровно как у человека,
// который заходил в приложение не один раз.
const ctx2 = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  args: [`--host-resolver-rules=MAP tauri.localhost 127.0.0.1:${port}`],
});
const page2 = await ctx2.newPage();
await page2.goto('http://tauri.localhost/');
// Порция вторая — мелкая, она останется в свежем `.log` и проверит разбор журнала.
await page2.evaluate(() => {
  localStorage.setItem('psygames_streak_v1', '9');
  localStorage.setItem('psygames_theme', 'dark');
});
await page2.waitForTimeout(800);
await ctx2.close();
server.close();

const src = path.join(userDataDir, 'Default', 'Local Storage', 'leveldb');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let ldb = 0;
let log = 0;
for (const name of fs.readdirSync(src)) {
  // LOCK — межпроцессный замок, в эталоне он не нужен и только мешает.
  if (name === 'LOCK') continue;
  fs.copyFileSync(path.join(src, name), path.join(OUT, name));
  if (name.endsWith('.ldb')) ldb++;
  if (name.endsWith('.log')) log++;
}

// Ожидаемое пишется РЯДОМ С ЭТАЛОНОМ и тем же прогоном. Иначе проба сверяла бы
// свежие байты со списком, набранным руками когда-то раньше, и расхождение
// читалось бы как ошибка разбора.
fs.writeFileSync(
  path.join(OUT, 'expected.json'),
  JSON.stringify(
    {
      origin: 'http://tauri.localhost',
      values: { ...data, psygames_streak_v1: '9', psygames_theme: 'dark' },
      ballast: { count: 120, length: 2000 },
    },
    null,
    2,
  ),
);

const files = fs.readdirSync(OUT);
console.log('эталон снят в', OUT);
console.log('файлов', files.length, '· сортированных таблиц (.ldb)', ldb, '· журналов (.log)', log);
console.log(files.join(' '));
if (ldb === 0 || log === 0) {
  console.error('🔴 эталон неполный: нужны И .ldb, И .log — иначе половина разбора не проверяется');
  process.exit(1);
}
