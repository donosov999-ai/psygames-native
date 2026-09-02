/**
 * 🔴 ПРАВИЛО УРОВНЯ НЕ ТЕРЯЕТСЯ ПРИ ПЕРЕДЕЛКЕ ШАПКИ.
 *
 * 02.09.2026 счётчики 25 игр переезжали со строк текста на данные (`hud`). Скрипт
 * вырезал блок статистики целиком — и вместе со строками унёс `<LevelRuleBadge>` в
 * четырёх играх. Внешне ничего не сломалось: тесты зелёные, экран рисуется. Просто
 * человек перестал видеть, какое правило действует на его уровне.
 *
 * Поймал ЛИНТ, а не гейт: осиротевший импорт `LevelRuleBadge`. Полагаться на это
 * нельзя — в игре, где импорт нужен и для чего-то ещё, потеря прошла бы молча.
 *
 * ⚠️ Проверка идёт от ИМПОРТА: если игра завела `useLevelRules`, значит у неё есть
 * правила уровня, и показать их она обязана.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const ИГРЫ = path.join(__dirname, '../../app/games');

describe('правило уровня видно игроку', () => {
  const файлы = fs.readdirSync(ИГРЫ).filter((f: string) => f.endsWith('.tsx'));

  it('есть что проверять: игры с правилами уровня существуют', () => {
    const сПравилами = файлы.filter((f: string) =>
      fs.readFileSync(path.join(ИГРЫ, f), 'utf8').includes('useLevelRules('));
    expect(сПравилами.length).toBeGreaterThan(10);
  });

  it('🔴 у каждой игры с правилами уровня правило где-то показано', () => {
    const молчат: string[] = [];
    for (const f of файлы) {
      const src = fs.readFileSync(path.join(ИГРЫ, f), 'utf8') as string;
      if (!src.includes('useLevelRules(')) continue;
      // Показать можно бейджем в шапке ИЛИ окном правил — но показать надо.
      if (!/<LevelRuleBadge/.test(src) && !/<LevelRuleModal/.test(src)) молчат.push(f);
    }
    expect(молчат).toEqual([]);
  });

  /**
   * 🔴 И ГЛАВНОЕ: БЕЙДЖ, КОТОРЫЙ БЫЛ, НЕ ПРОПАДАЕТ.
   *
   * Проверка выше пропустила бы ровно тот случай, ради которого гейт написан:
   * игра показывала правило И бейджем, И окном, скрипт вырезал бейдж вместе со
   * строками текста — а окно осталось, и «показано хоть как-то» зеленеет.
   * Импорт `LevelRuleBadge` без единого использования и есть след такой потери.
   */
  it('🔴 импортированный бейдж правила действительно рисуется', () => {
    const осиротели: string[] = [];
    for (const f of файлы) {
      const src = fs.readFileSync(path.join(ИГРЫ, f), 'utf8') as string;
      if (!/import[^;]*LevelRuleBadge[^;]*;/.test(src)) continue;
      if (!/<LevelRuleBadge/.test(src)) осиротели.push(f);
    }
    expect(осиротели).toEqual([]);
  });
});
