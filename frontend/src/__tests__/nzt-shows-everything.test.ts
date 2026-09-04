import { GAMES, visibleInCatalog, isHubGame } from '@/src/constants/games';
import { PROFILES, filterAllowedGames } from '@/src/constants/profiles';
/**
 * 🔴 В ПРОФИЛЕ НЗТ-48 ДОСТУПНО КАЖДОЕ УПРАЖНЕНИЕ. БЕЗ ИСКЛЮЧЕНИЙ.
 *
 * Правило Дениса 04.09.2026, слово в слово: «главное не проеби правило, что все
 * упражнения должны отображаться в профиле НЗТ-48». Повод — шесть новых развилок:
 * каждая прячет свои игры из каталога, и достаточно одной ошибки в `mergedInto`,
 * чтобы упражнение пропало НАВСЕГДА и молча — карточки нет, развилка на него не
 * ведёт, найти нечем.
 *
 * Проверяем ДОСТИЖИМОСТЬ, а не видимость карточки: игра засчитывается, если она
 * либо сама в каталоге, либо лежит внутри развилки, которая в каталоге есть И
 * которая на неё действительно ссылается (экран развилки, а не пометка в реестре).
 */
declare const __dirname: string;
declare function require(m: string): any;
const fs = require('fs');
const path = require('path');


const НЗТ = 'nzt48';
const КОРЕНЬ = path.join(__dirname, '../..');
const безКомментариев = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/** Все маршруты, до которых можно дойти из экрана развилки по ссылкам. */
function изРазвилки(route: string): Set<string> {
  const виден = new Set<string>();
  const очередь = [route];
  while (очередь.length) {
    const r = очередь.shift()!;
    if (виден.has(r)) continue;
    виден.add(r);
    const f = path.join(КОРЕНЬ, 'app' + r + '.tsx');
    if (!fs.existsSync(f)) continue;
    for (const m of безКомментариев(fs.readFileSync(f, 'utf8')).matchAll(/'(\/games\/[a-z0-9-]+)'/g)) {
      if (!виден.has(m[1]!)) очередь.push(m[1]!);
    }
  }
  return виден;
}

/**
 * ⚠️ ИСКЛЮЧЕНИЯ — С ПРОВЕРЯЕМЫМ АДРЕСОМ, А НЕ НА СЛОВО. У каждой записи указан
 * файл, где лежит НАСТОЯЩИЙ вход; гейт открывает его и требует найти там маршрут.
 * Запись, которая перестала быть правдой, роняет прогон — иначе список исключений
 * за месяц превращается в кладбище.
 */
const ВХОД_В_ДРУГОМ_МЕСТЕ: Record<string, { файл: string; почему: string }> = {
  eye_gym: {
    файл: 'src/games/pause/core/engine.ts',
    почему: 'гимнастика глаз — одна из практик набора «Пауза» (`eye-gym` в наборе движка), и вход в неё оттуда. Отдельный экран /games/eye-gym оставлен ради «Зарядки»: там он шаг плейлиста. ⚠️ 04.09.2026 гейт вскрыл, что в СЕТКЕ каталога упражнение не появляется вовсе — карточка скрыта, а обещанной кнопки на главной нет: её слили в «Паузу» 26.08. Формально правило Дениса «в НЗТ видно всё» держится только через «Паузу»; если он захочет отдельную карточку, снять hideFromMenu.',
  },
  go_no_go: {
    файл: 'app/games/inhibition.tsx',
    почему: 'подпроба реализована режимом внутри «Торможения»; отдельный экран go-no-go.tsx — дубликат, решение о сносе за владельцем',
  },
  stop_signal: {
    файл: 'app/games/inhibition.tsx',
    почему: 'подпроба реализована режимом внутри «Торможения»; отдельный экран stop-signal.tsx — дубликат, решение о сносе за владельцем',
  },
};

describe('профиль НЗТ-48 показывает всё', () => {
  const профиль = PROFILES.find((p) => p.id === НЗТ);

  it('профиль на месте и открывает всё', () => {
    expect(профиль).toBeTruthy();
    expect(filterAllowedGames(профиль!).length).toBe(GAMES.length);
  });

  it('🔴 каждое упражнение достижимо: карточкой или через развилку', () => {
    const каталог = visibleInCatalog(GAMES, НЗТ);
    const карточкой = new Set(каталог.map((g) => g.id));
    const черезРазвилку = new Set<string>();
    for (const х of каталог.filter((g) => isHubGame(g.id))) {
      if (!х.route) continue;
      const маршруты = изРазвилки(х.route);
      for (const g of GAMES) if (g.route && маршруты.has(g.route)) черезРазвилку.add(g.id);
    }
    const потеряны = GAMES
      .filter((g) => !g.sandbox && !isHubGame(g.id))
      .filter((g) => !карточкой.has(g.id) && !черезРазвилку.has(g.id))
      .filter((g) => !ВХОД_В_ДРУГОМ_МЕСТЕ[g.id])
      .map((g) => `${g.id} (${g.route ?? 'без маршрута'})${g.mergedInto ? ' → числится в ' + g.mergedInto : ''}`);
    expect(потеряны).toEqual([]);
  });

  it('🔴 исключения не протухли: обещанный вход существует на самом деле', () => {
    const враньё: string[] = [];
    for (const [id, зап] of Object.entries(ВХОД_В_ДРУГОМ_МЕСТЕ)) {
      const игра = GAMES.find((g) => g.id === id);
      if (!игра) { враньё.push(`${id}: игры нет в каталоге`); continue; }
      const f = path.join(КОРЕНЬ, зап.файл);
      if (!fs.existsSync(f)) { враньё.push(`${id}: ${зап.файл} не существует`); continue; }
      const текст = безКомментариев(fs.readFileSync(f, 'utf8'));
      const поМаршруту = игра.route && текст.includes(игра.route);
      // Имя ищем во всех живых написаниях: `go_no_go`, `go-no-go`, `gonogo`.
      const написания = [id, id.replace(/_/g, '-'), id.replace(/_/g, '')];
      const поИмени = написания.some((н) => текст.includes(н));
      if (!поМаршруту && !поИмени) враньё.push(`${id}: в ${зап.файл} нет ни маршрута, ни имени — вход обещан, но не найден`);
    }
    expect(враньё).toEqual([]);
  });

  it('самопроверка: выдуманная потеря ловится', () => {
    const каталог = visibleInCatalog(GAMES, НЗТ).map((g) => g.id);
    expect(каталог).not.toContain('такой-игры-нет');
  });
});
