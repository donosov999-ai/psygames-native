/**
 * Ни одна игра не запускает следующий уровень сама, когда идёт зарядка.
 *
 * ЗАЧЕМ. Это была гонка двух таймеров, и она стреляла у людей:
 *
 *   игра:    доиграл уровень → через 1200–2200 мс сам грузит СЛЕДУЮЩИЙ уровень;
 *   зарядка: увидела сохранённую сессию → через 2000–3500 мс уходит к СЛЕДУЮЩЕЙ игре.
 *
 * Человек видит, как начался уровень 2, и через секунду экран выдёргивают.
 * Репорты Вали на v1.193.0: «Маджонг выдаёт уровень 2 и ВЫЛЕТАЕТ в вечерней зарядке»,
 * «Сортировка товаров тоже выдаёт второй уровень и вылетает».
 *
 * ⚠️ ПОЧЕМУ ТЕСТ, А НЕ ПРОСТО ПРАВКА. Игр шесть десятков. Чинить поодиночке —
 * значит заводить баг заново с каждой новой игрой: ровно так было с судоку, где
 * «выцветшую цифру на подложке» чинили в трёх версиях подряд, перечисляя варианты
 * правил вместо правила. Здесь правило объявлено в useGameMode, а тест стережёт,
 * что его никто не обошёл.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const GAMES_DIR = join(__dirname, '../../app/games');

/**
 * Игры, которые сами грузят следующий уровень, минуя общий экран LevelCleared.
 *
 * ⚠️ Защиту ищем НЕ ТОЛЬКО в самой строке, но и в нескольких строках выше: часто
 * она стоит отдельным ранним возвратом («если это зарядка — выйти»), а не условием
 * внутри таймера. Первая версия теста смотрела одну строку и краснела на верном
 * коде сортировки товаров, где `if (!chainNext) { … return; }` стоял абзацем выше.
 */
/**
 * ⚠️ ТОЛЬКО признаки, относящиеся ИМЕННО к сцепке. Сначала сюда входил ещё isPreset —
 * и он маскировал пропажу защиты: в picture-pairs двумя строками выше стоит
 * `if (!isPreset) lvl.setLevel(next)`, к запуску следующего уровня отношения не
 * имеющее. Мутация это и вскрыла: убрал защиту — тест остался зелёным.
 */
const GUARD = /chainNext|shouldChainNextLevel|gameMode/;
const LOOKBACK = 12;      // сколько строк выше искать защиту
const TIMER_REACH = 6;    // на сколько строк ниже setTimeout тянется его тело

/**
 * ⚠️ ПОИСК МНОГОСТРОЧНЫЙ, И ЭТО НЕ ПРИДИРКА. Первая версия требовала setTimeout и
 * loadLevel в ОДНОЙ строке — а стоило обернуть таймер в несколько строк, как детектор
 * переставал видеть игру вовсе и молчал бы при любой поломке. Поймано мутацией:
 * убрал защиту в маджонге, тест остался зелёным. Гейт, не ловящий свой же случай,
 * хуже отсутствия гейта — он создаёт ощущение проверки.
 */
function selfChaining(): { file: string; line: string }[] {
  const out: { file: string; line: string }[] = [];
  for (const f of readdirSync(GAMES_DIR)) {
    if (!f.endsWith('.tsx')) continue;
    const lines: string[] = readFileSync(join(GAMES_DIR, f), 'utf8').split('\n');

    lines.forEach((line: string, i: number) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*')) return;
      // Интересует запуск СЛЕДУЮЩЕГО уровня, а не первичная загрузка в startGame.
      if (!/(loadLevel|startLevel|nextLevel)\s*\(\s*(next|level)\b/.test(line)) return;

      // Он должен быть внутри отложенного запуска — иначе это обычный переход.
      const before = lines.slice(Math.max(0, i - TIMER_REACH), i + 1).join('\n');
      if (!/setTimeout/.test(before)) return;

      const window = lines.slice(Math.max(0, i - LOOKBACK), i + 1).join('\n');
      if (GUARD.test(window)) return;
      out.push({ file: f, line: t });
    });
  }
  return out;
}

describe('сцепка уровней и зарядка', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(readdirSync(GAMES_DIR).filter((f: string) => f.endsWith('.tsx')).length).toBeGreaterThan(50);
  });

  it('каждая самостоятельная сцепка спрашивает режим', () => {
    const unguarded = selfChaining().map((h) => `${h.file}: ${h.line.slice(0, 80)}`);

    expect(unguarded).toEqual([]);
  });

  it('общий экран «уровень пройден» тоже спрашивает режим — им пользуются 49 игр', () => {
    const src: string = readFileSync(join(__dirname, '../components/LevelCleared.tsx'), 'utf8');
    expect(src).toContain('useGameMode');
    expect(src).toContain('chainNext');
  });

  it('правило живёт в одном месте, а не переписано по игре', () => {
    const src: string = readFileSync(join(__dirname, '../hooks/useGameMode.ts'), 'utf8');
    expect(src).toContain("export type GameMode = 'levels' | 'free' | 'warmup'");
    expect(src).toContain('export function shouldChainNextLevel');
  });
});
