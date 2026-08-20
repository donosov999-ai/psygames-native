/**
 * ИНСТРУМЕНТЫ СТРАТЕГИИ ВО ФРАКТАЛЬНОЙ СУДОКУ: ПОМЕТКИ, РАСКРАСКА, МИНИ-КАРТА И
 * НАСТОЯЩАЯ (А НЕ ОБЪЯВЛЕННАЯ) СЛОЖНОСТЬ.
 *
 * ЗАЧЕМ. Партия идёт по десяти сеткам 9×9 и длится часами. Держать кандидатов в голове
 * на таком объёме нельзя: ступени 4–6 лестницы техник (голая пара, скрытая пара,
 * X-wing) требуют помнить по два-три кандидата в нескольких клетках РАЗОМ. Без места,
 * куда это записать, верхняя половина игры не решается — она угадывается.
 *
 * ⚠️ ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ НЕ ПО РАЗМЕТКЕ. В SET бейдж отсчёта был написан, переведён
 * на 12 языков и покрыт гейтом — и не показывался ни разу, потому что состояние, от
 * которого зависел показ, нигде не присваивалось. Поэтому:
 *   · поведение пометок и раскраски проверяется на самих сервисах, вызовами;
 *   · подпись сложности сверяется с ЧУЖИМ решателем (gradePuzzle) на живых партиях —
 *     то есть проверяется не «подпись нарисована», а «подпись не врёт»;
 *   · связь «блок корня ↔ дочерняя сетка», на которой стоит мини-карта, проверяется по
 *     движку, а не по вёрстке.
 */
import {
  emptyPencilMarks, normalizePencilMarks, togglePencilMark, clearPencilMarks,
  pencilDigits, hasPencilMark, countPencilMarks, PENCIL_MAX_DIGIT,
} from '@/src/services/pencilMarks';
import {
  emptySudokuCellColors, toggleSudokuCellColor, normalizeSudokuCellColors, SUDOKU_COLOR_COUNT,
} from '@/src/services/sudoku-coloring';
import {
  generateFractal, rootCellForChild, portalOf, withPortalsResolved, N,
} from '@/src/services/fractal-sudoku';
import {
  fractalTechniqueKey, FRACTAL_TECHNIQUE_KEYS, FRACTAL_TIER_STEPS, fractalLevel,
} from '@/src/services/fractalLevels';
import { gradePuzzle } from '@/src/services/sudoku-grade';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

const SCREEN: string = readFileSync(join(__dirname, '../../app/games/sudoku-fractal.tsx'), 'utf8');
const BASE_DICT: string = readFileSync(join(__dirname, '../contexts/LanguageContext.tsx'), 'utf8');
const CTX = { N: 9, BR: 3, BC: 3, variant: 'none' as const };

describe('карандашные пометки — общий сервис', () => {
  it('пишет и снимает тем же движением, что и карандаш на бумаге', () => {
    let m = emptyPencilMarks(N);
    expect(countPencilMarks(m)).toBe(0);
    m = togglePencilMark(m, N, 3, 4, 7);
    expect(hasPencilMark(m, 3, 4, 7)).toBe(true);
    m = togglePencilMark(m, N, 3, 4, 7);   // повторное нажатие снимает
    expect(hasPencilMark(m, 3, 4, 7)).toBe(false);
    expect(countPencilMarks(m)).toBe(0);
  });

  it('в одной клетке живут все девять цифр разом — иначе пометки бесполезны', () => {
    // Ради этого всё и затевалось: «голая пара» — это ДВА кандидата в клетке,
    // а «скрытая пара» разбирается по расположению цифры во всей зоне.
    let m = emptyPencilMarks(N);
    for (let d = 1; d <= PENCIL_MAX_DIGIT; d++) m = togglePencilMark(m, N, 0, 0, d);
    expect(pencilDigits(m[0][0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(countPencilMarks(m)).toBe(9);
  });

  it('ластик чистит клетку целиком, а соседей не трогает', () => {
    let m = emptyPencilMarks(N);
    for (const d of [1, 5, 9]) m = togglePencilMark(m, N, 2, 2, d);
    m = togglePencilMark(m, N, 2, 3, 4);
    m = clearPencilMarks(m, N, 2, 2);
    expect(pencilDigits(m[2][2])).toEqual([]);
    expect(pencilDigits(m[2][3])).toEqual([4]);
  });

  it('исходное состояние не портится — иначе React не увидит изменения', () => {
    // Мутация на месте означала бы, что setState получает тот же объект и экран
    // не перерисуется: пометка «поставлена», а на доске её нет.
    const before = emptyPencilMarks(N);
    const after = togglePencilMark(before, N, 1, 1, 3);
    expect(before[1][1]).toBe(0);
    expect(after).not.toBe(before);
  });

  it('битая запись из хранилища гасится, а не роняет экран', () => {
    // Незаконченная партия живёт месяц и переживает обновления приложения.
    expect(normalizePencilMarks(null, N)[0][0]).toBe(0);
    expect(normalizePencilMarks('мусор', N).length).toBe(N);
    expect(normalizePencilMarks([[1, 2]], N).length).toBe(N);
    const dirty = emptyPencilMarks(N);
    dirty[0][0] = 1 << 30;          // лишние биты нарисовали бы несуществующие цифры
    dirty[0][1] = -5;
    (dirty[0] as unknown[])[2] = 'семь';
    const clean = normalizePencilMarks(dirty, N);
    expect(clean[0][0]).toBe(0);
    expect(clean[0][1]).toBe(0);
    expect(clean[0][2]).toBe(0);
    // а живое значение переживает разбор
    const ok = togglePencilMark(emptyPencilMarks(N), N, 4, 4, 6);
    expect(normalizePencilMarks(ok, N)[4][4]).toBe(ok[4][4]);
  });
});

describe('раскраска — тот же сервис, что в обычной судоку', () => {
  it('цвет ставится, меняется и снимается повторным тапом', () => {
    let c = emptySudokuCellColors(N);
    c = toggleSudokuCellColor(c, N, 5, 5, 2);
    expect(c[5][5]).toBe(2);
    c = toggleSudokuCellColor(c, N, 5, 5, 3);   // другой цвет — заменяет
    expect(c[5][5]).toBe(3);
    c = toggleSudokuCellColor(c, N, 5, 5, 3);   // тот же — снимает
    expect(c[5][5]).toBe(-1);
  });

  it('битая запись гасится', () => {
    expect(normalizeSudokuCellColors(undefined, N)[0][0]).toBe(-1);
    const dirty = emptySudokuCellColors(N);
    dirty[0][0] = SUDOKU_COLOR_COUNT + 4;
    expect(normalizeSudokuCellColors(dirty, N)[0][0]).toBe(-1);
  });
});

describe('🔴 подпись сложности не врёт: сверка с ЧУЖИМ решателем', () => {
  /**
   * Плитка обязана показывать ступень, которая ВЫШЛА, а не которую заказал уровень.
   * С 21-го уровня часть сеток берётся из библиотеки заготовок, часть копается на
   * месте, и внутри одной партии они разные по построению (вторая ось сложности).
   * Подпись «как задумано» врала бы каждую партию.
   */
  /**
   * ⚠️ СТУПЕНЬ МЕРЯЕТСЯ НА ДОСКЕ С РАЗРЕШЁННЫМ ПОРТАЛОМ, А НЕ НА НАПЕЧАТАННОЙ. Сетка,
   * которую задел портал, ПОРОЗНЬ не решается вообще — цифру в портальной клетке даёт
   * только соседний пазл. Спроси у градатора ступень напечатанного задания, и он честно
   * ответит «только перебором» у КАЖДОЙ такой сетки, то есть подпись стала бы невозможной.
   * Ровно так же уже устроен корень: его ступень считается по доске с девятью цифрами
   * снизу, а печатается он без них.
   */
  it('ступень каждой сетки подтверждается gradePuzzle', () => {
    const bad: string[] = [];
    let withPortal = 0;
    for (const level of [1, 15, 23, 30]) {
      const f = generateFractal(level, `гейт-подпись-${level}`);
      for (const [i, ch] of f.children.entries()) {
        const board = withPortalsResolved(ch.puzzle, f.portals, i);
        const g = gradePuzzle(board, CTX, ch.tier);
        if (!g.solved) bad.push(`L${level}#${i}: градатор не решил в пределах подписанной ступени ${ch.tier}`);
        if (g.solved && g.tier !== ch.tier) bad.push(`L${level}#${i}: подпись ${ch.tier}, градатор ${g.tier}`);
        // и БЕЗ подписанной техники доска не берётся — иначе подпись завышена
        if (ch.tier > 1 && gradePuzzle(board, CTX, ch.tier - 1).solved) {
          bad.push(`L${level}#${i}: подписана ступень ${ch.tier}, а берётся и без неё`);
        }
        // 🔴 …а НАПЕЧАТАННОЕ задание сетки с порталом ЧУЖОЙ решатель не добивает НИЧЕМ,
        //    даже с потолком выше всякой техники: это и есть доказательство, что портал
        //    несущий, а не украшение поверх и так решаемой доски.
        if (portalOf(f.portals, i)) {
          withPortal++;
          if (gradePuzzle(ch.puzzle, CTX, 9).solved) {
            bad.push(`L${level}#${i}: сетка с порталом решается и без него — портал декоративен`);
          }
        }
      }
    }
    // Без этого проверка портала зелена вслепую: на уровнях без порталов сверять нечего.
    expect(`сеток с порталом: ${withPortal > 0}`).toBe('сеток с порталом: true');
    expect(bad).toEqual([]);
  }, 600000);

  it('в одной партии ступени РАЗНЫЕ — ради этого подпись и нужна', () => {
    // Если бы все девять сеток были одной сложности, подпись на плитке была бы
    // повторением заголовка уровня и не стоила бы места на экране.
    const f = generateFractal(23, 'гейт-подпись-разброс');
    const tiers = new Set(f.children.map((c) => c.tier));
    expect(`разных ступеней в партии: ${tiers.size >= 2}`).toBe('разных ступеней в партии: true');
    // и объявленная уровнем ступень — не то же самое, что у каждой сетки
    const declared = fractalLevel(23).tier;
    expect(f.children.some((c) => c.tier !== declared)).toBe(true);
  }, 300000);

  it('у каждой ступени есть своё имя, и все имена разные', () => {
    const keys = Array.from({ length: FRACTAL_TIER_STEPS }, (_, i) => fractalTechniqueKey(i + 1));
    expect(new Set(keys).size).toBe(FRACTAL_TIER_STEPS);
    expect(keys).toEqual([...FRACTAL_TECHNIQUE_KEYS]);
    // ключи обязаны существовать в словаре, иначе экран покажет само имя ключа
    for (const k of keys) expect(`${k} в словаре: ${BASE_DICT.includes(`  ${k}: {`)}`).toBe(`${k} в словаре: true`);
    // мусор на входе не даёт пустой подписи
    expect(fractalTechniqueKey(0)).toBe(keys[0]);
    expect(fractalTechniqueKey(99)).toBe(keys[FRACTAL_TIER_STEPS - 1]);
  });
});

describe('мини-карта стоит на настоящей связи блока и сетки', () => {
  it('блок корня, посчитанный как в мини-карте, совпадает с движком', () => {
    // Мини-карта красит блок r/3·3 + c/3 состоянием дочерней с тем же номером.
    // Если эта арифметика разойдётся с rootCellForChild, карта будет показывать
    // «решено» не там, где решено, — и это хуже отсутствия карты.
    const bad: string[] = [];
    for (let i = 0; i < 9; i++) {
      const [r, c] = rootCellForChild(i);
      const block = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      if (block !== i) bad.push(`сетка ${i} кормит клетку ${r},${c} — это блок ${block}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('экран действительно даёт этими инструментами пользоваться', () => {
  it('пометки, раскраска и мини-карта подключены, а не только написаны', () => {
    expect(SCREEN).toContain('togglePencilMark');
    expect(SCREEN).toContain('toggleSudokuCellColor');
    expect(SCREEN).toContain('renderMarks');
    expect(SCREEN).toContain('miniMap');
    // ⚠️ Слои обязаны ДОЕЗЖАТЬ до отрисовки. Написанный, но не вызванный renderMarks —
    // ровно поломка бейджа SET: код есть, на экране ничего.
    // Полей ровно ДВА — корень на карте и дочерняя во весь экран. Слои обязаны быть в
    // обоих: инструмент, работающий только в одном, человек читает как поломку.
    expect((SCREEN.match(/\{renderMarks\(/g) ?? []).length).toBe(2);
    expect((SCREEN.match(/cellSkin\(/g) ?? []).length).toBe(2);
    expect(SCREEN).toMatch(/\{miniMap\(openChild\)\}/);
  });

  it('переключатель инструмента реально меняет, куда попадёт нажатие', () => {
    // Кнопка, которая только красится, но не влияет на ввод, — это бейдж SET заново.
    expect(SCREEN).toMatch(/tool === 'pencil'.*mark\(/s);
    expect(SCREEN).toMatch(/tool === 'paint'/);
    expect(SCREEN).toContain("setTool(");
  });

  it('пометки и раскраска переживают выход из партии', () => {
    // Слой, который теряется при сворачивании приложения, бесполезен в партии на часы.
    expect(SCREEN).toMatch(/marks,\n\s+paint,/);
    expect(SCREEN).toContain('normalizePencilMarks(s.marks');
    expect(SCREEN).toContain('normalizeSudokuCellColors(s.paint');
    // формат снимка изменился — версия обязана вырасти, иначе старая запись уронит экран
    expect(SCREEN).toMatch(/RESUME_V = ([2-9]|\d{2,})/);
  });

  it('цифра пометки НЕ стирает — иначе отмена хода снова станет половинчатой', () => {
    // Стирай цифра пометки, откат хода вернул бы клетку, но не вернул бы стёртое.
    // Здесь цифра лишь перекрывает слой: renderMarks молчит при непустом значении.
    expect(SCREEN).toMatch(/if \(value !== 0\) return null;/);
    expect(SCREEN).not.toMatch(/clearPencilMarks\([^)]*\)[^;]*;\s*\/\/ при вводе цифры/);
  });

  it('подпись сложности берётся у сетки, а не у уровня', () => {
    expect(SCREEN).toContain('fractalTechniqueKey');
    expect(SCREEN).toMatch(/puzzle\?\.children\[i\]\.tier/);
    expect(SCREEN).toMatch(/task\.tier/);
    // ⚠️ Именно этого делать нельзя: cfg.tier — то, что ЗАКАЗАНО уровнем.
    expect(SCREEN).not.toMatch(/fractalTechniqueKey\(cfg\.tier\)/);
  });
});
