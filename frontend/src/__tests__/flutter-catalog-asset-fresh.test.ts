/* psygames-flutter-catalog-asset-fresh · VER 3 · 07.10.2026 */
/**
 * КАТАЛОГ ИГР ДЛЯ НАТИВНОГО ЭКРАНА «ИГРЫ» — ВЫГРУЗКОЙ ИЗ ЖИВОГО TS, И СВЕЖЕСТЬ ПОД СТОРОЖЕМ
 * (задачи f5025027 поиск и фильтр, 9bd1b15d перенос каталога).
 *
 * 🔴 ПОЧЕМУ ВЫГРУЗКА, А НЕ КОПИЯ. Раздел, навык, ключи названия и описания, градиент живут в
 * `GAMES` (`src/constants/games.ts`, 1500+ строк). Список на Dart стал бы вторым реестром,
 * который отстанет от первого молча — ровно так 23.09 развилки говорили по-русски на всех языках.
 * Натив читает `flutter/assets/catalog.json`, эта проба держит его свежим.
 *
 * Чего здесь НЕТ: отбора по профилю. Его считает веб той же функцией, что рисует свою вкладку,
 * и кладёт в общую память (`hubVisibility().catalog`, `psygames_hub_visible`).
 *
 * ⚠️ ЭТО СТОРОЖ: без переменной WRITE он сравнивает и КРАСНЕЕТ, если игры поменяли, а ассет нет.
 * 🔴 VER 2 (07.10, задача 99628ecf — плитки как у веба): у каждой игры ещё `look` — ГОТОВЫЕ цвета
 * плитки, посчитанные теми же функциями, что рисуют веб-карточку (`GameCard`: `onGradientText`,
 * `onGradientTextMuted`, `innerScrim`, `accentOn`, вуаль `GradientSurface`), — и превью фоном
 * (`gameThumbs.ts`: файл и прозрачность). Цветовую математику (330 строк, WCAG по обоим концам
 * градиента) на Dart НЕ переписываем: градиенты постоянные, и готовый ответ веба не разойдётся с
 * вебом по определению. Превью копируются в `flutter/assets/game_thumbs/` и сверяются побайтно.
 *
 * Перевыпуск — из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-catalog-asset-fresh.test.ts
 * и затем `node flutter/tools/embed-l10n.mjs` (ключи навыков и разделов словарь берёт отсюда).
 */
import { GAMES, CATEGORY_ORDER, CATEGORY_META } from '@/src/constants/games';
import { gameThumbOpacity } from '@/src/constants/gameThumbs';
import { onGradientText, onGradientTextMuted, innerScrim, accentOn, relativeLuminance, withAlpha } from '@/src/services/onGradientText';

declare function require(id: string): any;
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as {
  readFileSync(p: string, e?: string): any; writeFileSync(p: string, d: string, e: string): void; existsSync(p: string): boolean;
  mkdirSync(p: string, o: { recursive: boolean }): void; copyFileSync(a: string, b: string): void; readdirSync(p: string): string[];
};
const path = require('path') as { resolve(...p: string[]): string };
const OUT = path.resolve(__dirname, '../../../flutter/assets/catalog.json');
const THUMBS_SRC = path.resolve(__dirname, '../constants/gameThumbs.ts');
const THUMBS_DIR = path.resolve(__dirname, '../../assets/images/gamethumbs');
const THUMBS_OUT = path.resolve(__dirname, '../../../flutter/assets/game_thumbs');

/** Файл превью по id — из самого реестра (`require` в jest картинку не отдаёт именем). */
function thumbFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /^\s*([a-z0-9_]+):\s*require\('\.\.\/\.\.\/assets\/images\/gamethumbs\/([^']+)'\)/gm;
  const src = fs.readFileSync(THUMBS_SRC, 'utf8') as string;
  for (let m = re.exec(src); m; m = re.exec(src)) out[m[1]] = m[2];
  return out;
}

/** CSS-цвет веба → `#AARRGGBB` для Flutter (`Color(int)`); `transparent` → нулевая прозрачность. */
function argb(css: string): string {
  const h2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  if (css === 'transparent') return '#00000000';
  const hex = /^#([0-9a-f]{6})$/i.exec(css);
  if (hex) return `#ff${hex[1].toLowerCase()}`;
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(css);
  if (!m) throw new Error(`цвет не разобран: ${css}`);
  return `#${h2(Number(m[4]) * 255)}${h2(+m[1])}${h2(+m[2])}${h2(+m[3])}`;
}

/** Цвета плитки — ровно как в `GameCard.tsx` (строки 78–85, 150, 187) и `GradientSurface.tsx`. */
function look(gradient: string[]) {
  const g = onGradientText(gradient[0], gradient[gradient.length - 1]);
  return {
    fg: argb(g.color),
    soft: argb(onGradientTextMuted(g)),
    light: relativeLuminance(g.color) < relativeLuminance(g.ends[0]),
    iconBg: argb(innerScrim(g, 0.16)),
    badgeBg: argb(innerScrim(g, 0.2)),
    star: argb(accentOn(g, '#FFD93B')),
    veil: g.veil ? argb(withAlpha(g.veil, g.veilAlpha)) : null,
  };
}

/** Поля карточки вкладки «Игры» (`GameCard` в `CategorySections`) и то, по чему ищут и фильтруют. */
// `sessionType` (07.10, «Прогресс» на Dart, d6a60b02): под каким типом игра пишет партии — у трёх
// игр он не равен id (`sessionTypeOf`), и раздел партии ищется по нему (`categoryOfSessionType`).
const FIELDS = ['id', 'route', 'nameKey', 'descKey', 'skillKey', 'category', 'icon', 'gradient', 'hub', 'sandbox', 'hideFromMenu', 'sessionType'] as const;

function build(): string {
  const thumbs = thumbFiles();
  const games = GAMES.map((g) => {
    const o: Record<string, unknown> = {};
    for (const f of FIELDS) if ((g as any)[f] !== undefined) o[f] = (g as any)[f];
    o.look = look(g.gradient);
    if (thumbs[g.id]) {
      o.thumb = thumbs[g.id];
      o.thumbOpacity = gameThumbOpacity(g.id);
    }
    return o;
  });
  const categories = CATEGORY_ORDER.map((id) => ({ id, ...CATEGORY_META[id] }));
  // По записи на строку: два PR, тронувшие разные игры, сводятся сами.
  const top = (k: string, v: unknown[]) => `${JSON.stringify(k)}:[\n${v.map((x) => JSON.stringify(x)).join(',\n')}\n]`;
  return `{\n${top('categories', categories)},\n${top('games', games)}\n}\n`;
}

describe('flutter/assets/catalog.json — свежая выгрузка каталога', () => {
  it('совпадает с живым TS', () => {
    const now = build();
    if (process.env.WRITE === '1') fs.writeFileSync(OUT, now, 'utf8');
    const was = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    // Сообщение — команда, а не загадка: тот, кто правил игры, чинит одним запуском.
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-catalog-asset-fresh.test.ts && node ../flutter/tools/embed-l10n.mjs' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
  });

  it('🔴 превью в ассетах Flutter — те же файлы, байт в байт', () => {
    const files = [...new Set(Object.values(thumbFiles()))].sort();
    expect(files.length).toBeGreaterThan(40);
    if (process.env.WRITE === '1') {
      fs.mkdirSync(THUMBS_OUT, { recursive: true });
      for (const f of files) fs.copyFileSync(path.resolve(THUMBS_DIR, f), path.resolve(THUMBS_OUT, f));
    }
    const differ = files.filter((f) => {
      const a = path.resolve(THUMBS_DIR, f), b = path.resolve(THUMBS_OUT, f);
      return !fs.existsSync(b) || !(fs.readFileSync(a) as any).equals(fs.readFileSync(b));
    });
    expect(differ).toEqual([]);
  });

  it('у каждой игры есть раздел из порядка разделов и ключ навыка', () => {
    const cats = new Set<string>(CATEGORY_ORDER);
    const bad = GAMES.filter((g) => !cats.has(g.category) || !g.skillKey).map((g) => g.id);
    expect(bad).toEqual([]);
  });
});
