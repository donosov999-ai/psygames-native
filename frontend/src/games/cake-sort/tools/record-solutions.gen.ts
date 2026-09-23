/**
 * @jest-environment node
 */
/* psygames-cake-record-solutions · VER 1 · 23.09.2026
 *
 * ЗАПИСЫВАЕТ РЕШЕНИЕ КАЖДОГО ВШИТОГО УРОВНЯ В `core/solutions.json`.
 *
 * 🔴 ЗАЧЕМ (задача af4c7ff1). Подсказка и пробы лестницы искали путь ЗАНОВО на
 * каждый вызов, и цена растёт с ветвлением. Замер 23.09.2026, бюджет 20000:
 *   L1  (18 продолжений) — 119 мс      L10 (102) — 24 954 мс
 *   L5  (42)             — 4 246 мс    L20 (260) — больше минуты, не дождался
 * В CI это выглядело так: `cake-sort-levels` 1267 с, `cake-sort-uses-prebuilt`
 * 909–1082 с, `cake-sort-hint` не уложилась в 43 минуты.
 *
 * Решение ищется ОДИН РАЗ здесь, лучом (`beamMoves`), и кладётся рядом с доской.
 * Дальше пробы просто ПРОИГРЫВАЮТ его (это дешевле и ДОКАЗАТЕЛЬНЕЕ поиска: видно
 * конкретное решение, а не «поиск что-то нашёл»), а экран ведёт по нему подсказку,
 * пока игрок с пути не свернул.
 *
 * ⚠️ ФАЙЛ НЕ ПОПАДАЕТ В ОБЫЧНЫЙ ПРОГОН (`*.gen.ts` вне `__tests__`). Запуск явный:
 *   npx jest --testMatch '**\/tools/record-solutions.gen.ts' --testTimeout 3600000
 *
 * ⚠️ ЛУЧ НЕ ОБЕЩАЕТ КРАТЧАЙШЕГО — он обещает ПУТЬ. Звёзды считаются от `min`
 * (точный поиск) и от `path`, а решение нужно ради скорости и наглядности.
 *
 * 🔴 ОТДЕЛЬНЫМ ФАЙЛОМ И ПЛОСКИМИ ТРОЙКАМИ, А НЕ ПОЛЕМ В `levels.json`. Первая
 * редакция клала `solution` рядом с доской объектами `{from,type,to}` — файл
 * уровней вырос со 149 до 732 КБ, а он едет и в приложение, и в ассеты
 * переноса. Тройки чисел стоят около семи байт на ход вместо тридцати: 10 148
 * ходов уложились в 96 КБ, и грузится этот файл только когда нажали подсказку.
 */
import { beamMoves } from '../core/solver';
import { makeBoard, moveType, isCleared, type Board } from '../core/plate';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

interface Уровень {
  level: number;
  plates: number[][];
  queue: number[][];
  [k: string]: unknown;
}

/** Проигрывает записанное решение и говорит, разобрался ли стол. */
function проигрывается(b: Board, ходы: { from: number; type: number; to: number }[]): boolean {
  let доска = b;
  for (const m of ходы) {
    const следующая = moveType(доска, m.from, m.type, m.to);
    if (!следующая) return false;
    доска = следующая;
  }
  return isCleared(доска);
}

describe('запись решений вшитых уровней', () => {
  it('каждому уровню записано решение, и оно проигрывается', () => {
    const файлУровней = path.join(__dirname, '..', 'core', 'levels.json');
    const данные = JSON.parse(fs.readFileSync(файлУровней, 'utf8')) as { circle: number; levels: Уровень[] };

    const нет: string[] = [];
    const неИграет: string[] = [];
    const ходы: Record<string, number[]> = {};
    const t0 = Date.now();
    for (const у of данные.levels) {
      const доска = makeBoard(у.plates, у.queue);
      const решение = beamMoves(доска);
      if (!решение) { нет.push(`L${у.level}`); continue; }
      // Проигрываем ЗДЕСЬ ЖЕ: записать путь, который не играется, хуже, чем не
      // записать ничего — пробы и подсказка поверили бы ему на слово.
      if (!проигрывается(доска, решение)) { неИграет.push(`L${у.level}`); continue; }
      ходы[String(у.level)] = решение.flatMap((m) => [m.from, m.type, m.to]);
    }
    const секунд = Math.round((Date.now() - t0) / 100) / 10;

    const файл = path.join(__dirname, '..', 'core', 'solutions.json');
    fs.writeFileSync(файл, `${JSON.stringify({
      note: 'Решение каждого вшитого уровня плоскими тройками [from, type, to, ...]. Пишет tools/record-solutions.gen.ts',
      moves: ходы,
    })}\n`);
    const килобайт = Math.round(fs.statSync(файл).size / 1024);
    const всегоХодов = Object.values(ходы).reduce((n, v) => n + v.length / 3, 0);
    // eslint-disable-next-line no-console
    console.log(`записано за ${секунд} с · уровней ${данные.levels.length} · без решения ${нет.length}`
      + ` · не проигрались ${неИграет.length} · ходов ${всегоХодов} · файл ${килобайт} КБ`);

    expect(неИграет).toEqual([]);
    expect(нет).toEqual([]);
    expect(Object.keys(ходы).length).toBe(данные.levels.length);
  }, 3_600_000);
});
