#!/usr/bin/env node
/* psygames-serve-dist · VER 1 · 27.08.2026 */
/**
 * Локальный показ собранного `dist` С ЧИСТЫМИ ПУТЯМИ.
 *
 * ⚠️ `python3 -m http.server` для этого не годится: экспорт Expo кладёт каждый
 * маршрут отдельным файлом (`games/pause.html`), а роутер в браузере смотрит на
 * `location.pathname` и на `.html` в адресе отвечает «Unmatched Route». Поэтому
 * здесь `/games/pause` отдаётся из `games/pause.html`, и путь остаётся чистым —
 * ровно как в собранном приложении.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const КОРЕНЬ = path.resolve(process.argv[2] ?? 'dist');
const ПОРТ = Number(process.argv[3] ?? 8098);
const ТИПЫ = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
  '.md': 'text/markdown; charset=utf-8',
  // Без этих трёх шрифт значков уходит как octet-stream, и значки остаются
  // пустыми квадратиками даже на исправном сервере.
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.jpg': 'image/jpeg',
};

createServer((запрос, ответ) => {
  let путь = decodeURIComponent(new URL(запрос.url, 'http://x').pathname);
  /**
   * 🔴 ПРЕФИКС СБОРКИ СРЕЗАЕТСЯ, ИНАЧЕ СТРАНИЦА ОТКРЫВАЕТСЯ МЁРТВОЙ.
   *
   * `app.json → experiments.baseUrl = "/psygames-web"`: разметка тянет все три
   * скрипта с этим префиксом, а сервер отдаёт `dist` с корня. Ответ на каждый —
   * 404, и вместе с ними 404-ит шрифт значков.
   *
   * Заметить это трудно: экспорт Expo — статический рендер, HTML приезжает с
   * ГОТОВОЙ разметкой. На кадре настоящий экран, а не работает НИЧЕГО: кнопки не
   * нажимаются ни `.click()`, ни настоящей мышью, `?lang=` не действует, эффекты
   * не применяются. Единственная примета — значки пустыми квадратиками.
   *
   * ⚠️ Проверять надо ответ на САМ скрипт, а не код страницы:
   *   curl -s -o /dev/null -w "%{http_code} %{size_download}\n" \
   *     "$BASE/psygames-web/_expo/static/js/web/entry-<хеш>.js"
   * Живой ответ — 200 и порядка 24 МБ. Сломанный — 404 и 25 байт.
   * Замер 07.09.2026: три прогона браузерного замера подряд выглядели
   * правдоподобно и были выдумкой, включая строку «РАЗБРОС 0».
   */
  const ПРЕФИКС = process.argv[4] ?? '/psygames-web';
  if (путь === ПРЕФИКС || путь.startsWith(`${ПРЕФИКС}/`)) путь = путь.slice(ПРЕФИКС.length) || '/';
  const кандидаты = [
    path.join(КОРЕНЬ, путь),
    path.join(КОРЕНЬ, `${путь}.html`),
    path.join(КОРЕНЬ, путь, 'index.html'),
  ];
  for (const файл of кандидаты) {
    if (!файл.startsWith(КОРЕНЬ)) continue;   // выход за корень запрещён
    if (existsSync(файл) && statSync(файл).isFile()) {
      ответ.writeHead(200, { 'Content-Type': ТИПЫ[path.extname(файл)] ?? 'application/octet-stream' });
      ответ.end(readFileSync(файл));
      return;
    }
  }
  ответ.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  ответ.end(`нет файла для ${путь}`);
}).listen(ПОРТ, () => console.log(`dist на http://localhost:${ПОРТ} (чистые пути)`));
