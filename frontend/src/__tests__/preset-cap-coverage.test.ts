/**
 * 🔴 НИ ОДНА ПРОГРАММА НЕ ВЫДАЁТ ЗАДАНИЕ ВЫШЕ ОСВОЕННОГО.
 *
 * Денис 30.08.2026 из зарядки: «запускается на большом уровне, который ещё не
 * освоен — сразу для запоминания 20 слов». Тогда починили ОДИН носитель жалобы
 * (мнемонику), и в журнале осталась честная приписка: «тот же класс наверняка
 * есть у других игр в программах — `hanoi` 4 диска, `picture_pairs` 10 пар».
 * Так и оказалось: 02.09.2026 нашлось тринадцать игр, где пресет применялся как
 * приказ. Хуже всех был n-back (программа просит 2-back человеку с 1-back — это
 * не «чуть труднее», а вдвое) и Шульте (6×6 = 36 чисел вместо 3×3 = 9).
 *
 * ⚠️ ГЛАВНОЕ В ЭТОМ ГЕЙТЕ — СПИСОК НОСИТЕЛЕЙ ВЫВОДИТСЯ ИЗ `profiles.ts`, А НЕ
 * ЗАШИТ ЗДЕСЬ. Зашитый список устаревает молча: добавят четырнадцатую игру с
 * числовой настройкой — и она пройдёт мимо проверки ровно так же, как прошли эти
 * тринадцать. Здесь же новая игра попадает под гейт автоматически, самим фактом
 * появления в программе.
 *
 * ⚠️ ЧТО СЧИТАЕТСЯ «ОБЪЁМОМ ЗАДАНИЯ». Не всякое число из `settings` задаёт
 * трудность: `trials` (сколько проб) и `duration` (сколько секунд) — это ДЛИНА
 * упражнения, её программа вправе назначать сама. Ограничиваем только то, что
 * делает задание ТЯЖЕЛЕЕ: размер поля, длину ряда, число дисков, пар, букв.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

/** Настройки-ДЛИНА: сколько проб и сколько секунд — их программа вправе задавать. */
const ДЛИНА = new Set(['trials', 'duration', 'previewMs', 'est_duration_sec']);

/** Игры, где ограничение живёт не через общий хелпер, — с причиной. */
const СВОЙ_ПРИЁМ: Record<string, RegExp> = {
  // Мнемоника чинилась первой, до появления хелпера; приём тот же, гейт свой
  // (`warmup-step-fits-level`), переписывать рабочий код ради единообразия — риск даром.
  mnemonics: /Math\.min\(ic, cap\)/,
};

function игрыСОбъёмом(): Record<string, string[]> {
  const src = read('src/constants/profiles.ts');
  const out: Record<string, Set<string>> = {};
  /**
   * ⚠️ Разбираем ПОСТРОЧНО. Первая редакция искала `game_id … settings` сквозным
   * `[\s\S]{0,300}?` — и приписала судоку чужие настройки (`discs`, `pairsCount`,
   * `startLen`), перескочив через несколько строк списка. Одна строка = один шаг
   * программы, поэтому смешать соседей невозможно.
   */
  const rows = src.split('\n')
    .map((line: string) => /game_id: '([a-z_0-9]+)'[^\n]*settings: \{([^}]*)\}/.exec(line))
    .filter(Boolean) as RegExpExecArray[];
  for (const m of rows) {
    const [, game, settings] = m;
    for (const s of settings.matchAll(/(\w+):\s*(\d+)/g)) {
      const ключ = s[1];
      if (ДЛИНА.has(ключ)) continue;
      (out[game] ??= new Set()).add(ключ);
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

const ФАЙЛ: Record<string, string> = {};
function файлИгры(gameId: string): string | null {
  if (ФАЙЛ[gameId] !== undefined) return ФАЙЛ[gameId];
  for (const имя of [gameId, gameId.replace(/_/g, '-')]) {
    const p = path.join(ROOT, 'app/games', `${имя}.tsx`);
    if (fs.existsSync(p)) return (ФАЙЛ[gameId] = fs.readFileSync(p, 'utf8'));
  }
  return (ФАЙЛ[gameId] = null as unknown as string);
}

describe('программа не выдаёт задание выше освоенного', () => {
  const носители = игрыСОбъёмом();

  it('есть что проверять: в программах правда стоят объёмы заданий', () => {
    const имена = Object.keys(носители);
    expect(имена.length).toBeGreaterThanOrEqual(10);
    // Поимённо — те, с которых всё началось.
    expect(имена).toEqual(expect.arrayContaining(['hanoi', 'picture_pairs', 'n_back']));
  });

  it('🔴 каждая такая игра ограничивает пресет уровнем', () => {
    const без: string[] = [];
    for (const [game, ключи] of Object.entries(носители)) {
      const src = файлИгры(game);
      if (!src) continue;                                   // игры нет в сборке — не наша забота
      const свой = СВОЙ_ПРИЁМ[game];
      if (свой ? свой.test(src) : src.includes('capPresetByLevel(')) continue;
      без.push(`${game} (${ключи.join(', ')})`);
    }
    expect(без).toEqual([]);
  });

  it('сам потолок считается верно и не наказывает дошедшего до верха', () => {
    const { capPresetByLevel } = require('../services/presetCap');
    expect(capPresetByLevel({ want: 20, atLevel: 5 })).toBe(6);        // хочет 20, освоил 5 → 6
    expect(capPresetByLevel({ want: 4, atLevel: 9 })).toBe(4);         // просит меньше — законно
    expect(capPresetByLevel({ want: 20, atLevel: 12, atTop: true })).toBe(20);   // верх лесенки
    expect(capPresetByLevel({ want: 6, atLevel: 3, step: 2 })).toBe(5);
    expect(capPresetByLevel({ want: 0, atLevel: 7 })).toBe(7);         // мусор → уровень
  });
});
