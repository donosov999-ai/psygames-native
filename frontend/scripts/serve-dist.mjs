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
};

createServer((запрос, ответ) => {
  const путь = decodeURIComponent(new URL(запрос.url, 'http://x').pathname);
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
