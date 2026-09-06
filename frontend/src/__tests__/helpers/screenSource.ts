/* psygames-test-helper-screen-source · VER 1 · 06.09.2026 */
/**
 * ИСХОДНИК ЭКРАНА ИГРЫ — С УЧЁТОМ ТОНКИХ МАРШРУТОВ.
 *
 * 🔴 ЗАЧЕМ. Часть игр делит один экран: «Сортировка шариков» и «Сортировка
 * гаек» — это `SortGameScreen` переливалки с другой шкуркой, а сам файл
 * маршрута состоит из трёх строк. Гейт, который читает `app/games/<игра>.tsx`
 * и ищет там `useCalmHush` или `GameShell`, на таком файле краснеет на ВЕРНОМ
 * коде: искомое лежит этажом ниже. Дублировать экран, чтобы гейт был доволен, —
 * ровно то, чего эти гейты и не должны допускать: три копии шестисотстрочного
 * экрана разъезжаются за неделю (в проекте это уже случилось с двумя экранами
 * судоку).
 *
 * ⚠️ ЗА ДЕЛЕГИРОВАНИЕМ ИДЁМ РОВНО НА ОДИН ШАГ. Цепочка переадресаций — это уже
 * запутанность, и гейт обязан о ней сказать, а не разматывать её молча.
 */
declare const __dirname: string;

const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..', '..', '..');
const APP_GAMES = join(ROOT, 'app', 'games');

/** Куда делегирует тонкий маршрут: `<Экран ... />` из соседнего файла игр. */
function делегатОдногоШага(src: string): string | null {
  // Экран по умолчанию отдаёт ровно один элемент, импортированный из app/games.
  const тело = /export default function \w+\([^)]*\)\s*{\s*return\s*<(\w+)[\s\S]*?;\s*}/.exec(src);
  if (!тело) return null;
  const имя = тело[1] as string;
  const импорт = new RegExp(`import\\s*{[^}]*\\b${имя}\\b[^}]*}\\s*from\\s*'@/app/games/([\\w-]+)'`).exec(src);
  return импорт ? (импорт[1] as string) : null;
}

/**
 * Исходник, по которому гейту следует судить об экране игры. Для обычной игры —
 * её собственный файл; для тонкого маршрута — файл экрана, которому он
 * делегирует, СКЛЕЕННЫЙ со своим (маршрут может добавлять своё, и терять это
 * нельзя).
 */
export function исходникЭкрана(route: string): string {
  const свой = readFileSync(join(APP_GAMES, `${route}.tsx`), 'utf8') as string;
  const куда = делегатОдногоШага(свой);
  if (!куда) return свой;
  const путь = join(APP_GAMES, `${куда}.tsx`);
  if (!existsSync(путь)) return свой;
  return `${свой}\n${readFileSync(путь, 'utf8') as string}`;
}

/** Делегирует ли маршрут чужому экрану — и кому именно. */
export function делегируетК(route: string): string | null {
  return делегатОдногоШага(readFileSync(join(APP_GAMES, `${route}.tsx`), 'utf8') as string);
}
